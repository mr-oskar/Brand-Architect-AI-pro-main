import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  authCookieOptions,
  AUTH_COOKIE_NAME,
} from "../lib/auth";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(body: any):
  | { ok: true; email: string; password: string; name?: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (!EMAIL_RE.test(email) || email.length > 254)
    return { ok: false, error: "Invalid email" };
  if (password.length < 8 || password.length > 200)
    return { ok: false, error: "Password must be at least 8 characters" };
  if (name && name.length > 100) return { ok: false, error: "Name too long" };
  return { ok: true, email, password, name: name || undefined };
}

function validateLogin(body: any):
  | { ok: true; email: string; password: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL_RE.test(email) || !password)
    return { ok: false, error: "Email and password are required" };
  return { ok: true, email, password };
}

router.post("/auth/register", async (req, res) => {
  const parsed = validateRegister(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const email = parsed.email.toLowerCase();

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(parsed.password);
  // Registration NEVER grants admin. Admin role can only be set by:
  //   1. The server-side bootstrap file (lib/seedAdmins.ts), or
  //   2. An existing admin via the admin panel (PATCH /api/admin/users/:id).
  const role = "user";
  const { getDefaultCredits } = await import("../lib/credits");
  const credits = await getDefaultCredits();
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name: parsed.name ?? null, role, credits })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
    });

  const token = signAuthToken({ userId: user.id, email: user.email });
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
  res.json({ user, token });
});

router.post("/auth/login", async (req, res) => {
  const parsed = validateLogin(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const email = parsed.email.toLowerCase();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await verifyPassword(parsed.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Login NEVER promotes a user to admin. The role is taken straight from the
  // database row written either by the bootstrap seeder or the admin panel.
  const token = signAuthToken({ userId: user.id, email: user.email });
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
  });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions(), maxAge: 0 });
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res) => {
  const cookieToken = (req as any).cookies?.[AUTH_COOKIE_NAME];
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = cookieToken || headerToken;
  if (!token) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      status: usersTable.status,
      credits: usersTable.credits,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  res.json({ user });
});

export default router;
