import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import hpp from "hpp";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { existsSync } from "node:fs";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { usageTracker } from "./middlewares/usageTracker";

const app: Express = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.disable("etag");

// ─── File-leakage protection ─────────────────────────────────────────────────
// Block any request that targets sensitive files such as .env, .git, source
// files, lockfiles, etc. This runs BEFORE static file serving so even when
// SERVE_FRONTEND=1 is enabled the API process never returns these files.
const FORBIDDEN_PATH_RE =
  /(?:^|\/)(?:\.env(?:\.[\w.-]+)?|\.git(?:\/|$)|\.gitignore|\.gitattributes|\.npmrc|\.replit|replit\.nix|replit\.md|package(?:-lock)?\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|tsconfig(?:\.[\w.-]+)?\.json|drizzle\.config\.[tj]s|vite\.config\.[tj]s|Dockerfile|docker-compose\.ya?ml)(?:\/|$)/i;
const FORBIDDEN_EXT_RE = /\.(?:ts|tsx|map|env|pem|key|crt|sql|log|bak|swp|DS_Store)$/i;

app.use((req: Request, res: Response, next: NextFunction) => {
  const url = req.path;
  if (FORBIDDEN_PATH_RE.test(url) || FORBIDDEN_EXT_RE.test(url)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

// ─── Security headers (helmet) ───────────────────────────────────────────────
// Strict Content-Security-Policy: the API server only returns JSON, so we lock
// everything down by default. When SERVE_FRONTEND=1 the static SPA needs a
// permissive policy because Vite builds inline-style nodes and uses dynamic
// imports — we relax CSP only in that mode.
const serveFrontend = process.env.SERVE_FRONTEND === "1";

const apiCspDirectives: Record<string, Iterable<string>> = {
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'", "data:", "blob:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  scriptSrc: ["'none'"],
  styleSrc: ["'none'"],
};

const spaCspDirectives: Record<string, Iterable<string>> = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  fontSrc: ["'self'", "data:", "https:"],
  connectSrc: [
    "'self'",
    "https:",
    "wss:",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
  ],
  scriptSrc: [
    "'self'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
  ],
  styleSrc: ["'self'", "'unsafe-inline'", "https:"],
  objectSrc: ["'none'"],
};

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: serveFrontend ? spaCspDirectives : apiCspDirectives,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" }, // X-Frame-Options: DENY (anti-clickjacking)
    noSniff: true,
    hidePoweredBy: true,
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
        : false,
  }),
);

app.use(compression());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be BEFORE body parsers (only when configured)
if (process.env.CLERK_SECRET_KEY) {
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
}

// ─── CORS — restrict to known Replit + custom domains ───────────────────────
const allowedOrigins = new Set<string>(
  (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `https://${d}`),
);

(process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean)
  .forEach((o) => allowedOrigins.add(o));

if (process.env.NODE_ENV !== "production") {
  // Allow local dev previews
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://localhost:5000");
  allowedOrigins.add("http://localhost:80");
}
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      // Same-origin / curl / server-to-server requests have no Origin header
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      // Accept any *.replit.dev / *.replit.app preview by default
      try {
        const host = new URL(origin).hostname;
        if (host.endsWith(".replit.dev") || host.endsWith(".replit.app")) {
          return cb(null, true);
        }
      } catch {
        /* fall through to deny */
      }
      // Disallowed origin → omit CORS headers entirely. The browser will then
      // refuse to expose the response. We avoid throwing so the server returns
      // a normal status code instead of a noisy 500.
      return cb(null, false);
    },
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(hpp()); // protect against HTTP parameter pollution

// Clerk session validation middleware (only when configured)
if (process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY) {
  app.use(clerkMiddleware());
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again in a minute." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit reached. Please wait a moment before generating more content." },
});

// Tighter limit for credential-handling endpoints. Mitigates brute-force /
// credential-stuffing attacks against /auth/login, /auth/register, and the
// Clerk proxy.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Failed auth attempts count; successful logins do not (so legitimate users
  // typing their password correctly aren't penalised).
  skipSuccessfulRequests: true,
  message: { error: "Too many authentication attempts. Please wait 15 minutes." },
});

app.use("/api", usageTracker);
app.use("/api", generalLimiter);

// Authentication endpoints — apply BEFORE the router so the limiter wraps them.
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/__clerk", authLimiter);

// AI generation endpoints — protect against abuse / cost runaway.
app.use("/api/brands/:id/generate-kit", aiLimiter);
app.use("/api/brands/:id/generate-campaign", aiLimiter);
app.use("/api/brands/:id/generate-campaign-async", aiLimiter);
app.use("/api/posts/:id/generate-image", aiLimiter);
app.use("/api/campaigns/:id/generate-all-images", aiLimiter);
app.use("/api/posts/:id/regenerate", aiLimiter);

app.use("/api", router);

// ─── Optional: serve the built frontend from the same Node process ───────────
// Useful for single-container Docker / generic-cloud deployments. In Replit,
// the frontend is served as a static artifact, so leave SERVE_FRONTEND unset.
// Set SERVE_FRONTEND=1 and (optionally) FRONTEND_DIST_DIR to enable.
if (serveFrontend) {
  const frontendDir =
    process.env.FRONTEND_DIST_DIR ??
    path.resolve(process.cwd(), "artifacts/brand-os/dist/public");
  if (existsSync(frontendDir)) {
    logger.info({ frontendDir }, "Serving frontend statically");
    app.use(
      express.static(frontendDir, {
        index: false,
        maxAge: "1y",
        // Refuse to serve dotfiles (.env, .git, etc) from the static dir.
        dotfiles: "deny",
        setHeaders(res, filePath) {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );
    // SPA fallback for client-side routing (anything not under /api)
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(frontendDir, "index.html"));
    });
  } else {
    logger.warn({ frontendDir }, "SERVE_FRONTEND=1 but dist dir not found");
  }
}

// Root handler so accidental visits to the API port don't show a confusing 404
if (!serveFrontend) {
  app.get("/", (_req, res) => {
    res.status(200).json({
      service: "brand-os-api",
      status: "ok",
      message: "This is the API server. Open the web app on port 5000.",
    });
  });
}

// JSON 404 for unknown /api routes (instead of default HTML)
app.use("/api", (req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl.split("?")[0],
    method: req.method,
  });
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";

  // Body too large (express.json / urlencoded) → 413 Payload Too Large
  if (err && typeof err === "object" && (err as any).type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large", limit: (err as any).limit });
    return;
  }

  // SyntaxError from express.json on malformed bodies → 400 Bad Request
  if (err instanceof SyntaxError && "body" in (err as any)) {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }

  // InsufficientCreditsError → 402 Payment Required (always surfaced to user)
  if (err && typeof err === "object" && "status" in err && (err as any).status === 402) {
    const e = err as any;
    res.status(402).json({
      error: e.message,
      code: "INSUFFICIENT_CREDITS",
      required: e.required,
      available: e.available,
      action: e.action,
    });
    return;
  }

  logger.error({ err, url: req.url }, "Unhandled error");
  // Don't leak stack traces or internal error messages to clients in production
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ error: "Internal server error" });
  } else {
    res.status(500).json({ error: message });
  }
});

export default app;
