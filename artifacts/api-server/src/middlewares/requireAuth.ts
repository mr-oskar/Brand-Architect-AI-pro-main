import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../lib/auth";

export interface AuthRequest extends Request {
  userId: string;
}

const CLERK_ENABLED = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
);
// Demo mode is a developer convenience and is hard-disabled in production
// regardless of the env var, so a misconfigured deploy can never expose user
// data behind the "demo-user" identity.
const ALLOW_DEMO =
  process.env.AUTH_ALLOW_DEMO === "1" &&
  process.env.NODE_ENV !== "production";
const DEMO_USER_ID = "demo-user";

function getTokenFromRequest(req: Request): string | null {
  const cookieToken = (req as any).cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // 1) Custom email/password auth (preferred)
  const token = getTokenFromRequest(req);
  if (token) {
    const payload = verifyAuthToken(token);
    if (payload) {
      (req as AuthRequest).userId = payload.userId;
      next();
      return;
    }
  }

  // 2) Clerk fallback (if configured)
  if (CLERK_ENABLED) {
    const auth = getAuth(req);
    const userId =
      (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
    if (userId) {
      (req as AuthRequest).userId = userId;
      next();
      return;
    }
  }

  // 3) Demo mode (only when explicitly enabled)
  if (ALLOW_DEMO) {
    (req as AuthRequest).userId = DEMO_USER_ID;
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
