import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const JWT_SECRET: string =
  process.env.AUTH_JWT_SECRET ||
  process.env.SESSION_SECRET ||
  randomBytes(32).toString("hex");

if (!process.env.AUTH_JWT_SECRET && !process.env.SESSION_SECRET) {
  console.warn(
    "[auth] AUTH_JWT_SECRET not set — using an ephemeral secret. " +
      "Sessions will be invalidated on every restart. " +
      "Set AUTH_JWT_SECRET in your env for stable sessions.",
  );
}

const TOKEN_TTL_DAYS = 30;
export const AUTH_COOKIE_NAME = "auth_token";

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (
      typeof decoded === "object" &&
      decoded &&
      typeof (decoded as AuthTokenPayload).userId === "string"
    ) {
      return decoded as AuthTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function authCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
