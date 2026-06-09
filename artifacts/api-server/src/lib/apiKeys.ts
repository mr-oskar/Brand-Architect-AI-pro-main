import { randomBytes, createHash } from "node:crypto";

export function generateApiKey(): { full: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const full = `sk_${raw}`;
  const prefix = full.slice(0, 12);
  const hash = createHash("sha256").update(full).digest("hex");
  return { full, prefix, hash };
}

export function hashApiKey(full: string): string {
  return createHash("sha256").update(full).digest("hex");
}

export function getApiKeyPrefix(full: string): string {
  return full.slice(0, 12);
}
