import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { hashPassword } from "./auth";
import { logger } from "./logger";

interface SeedAdmin {
  email: string;
  password?: string;
  name?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FILE = path.resolve(process.cwd(), "config/admins.json");

function dedupe(list: SeedAdmin[]): SeedAdmin[] {
  const seen = new Map<string, SeedAdmin>();
  for (const a of list) {
    const email = a.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) continue;
    if (!seen.has(email)) {
      seen.set(email, { ...a, email });
    }
  }
  return Array.from(seen.values());
}

async function readFromFile(file: string): Promise<SeedAdmin[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as
      | { admins?: SeedAdmin[] }
      | SeedAdmin[];
    const list = Array.isArray(parsed) ? parsed : parsed.admins ?? [];
    return Array.isArray(list) ? list : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn({ err, file }, "[seedAdmins] could not read admin bootstrap file");
    }
    return [];
  }
}

function readFromEnv(): SeedAdmin[] {
  const raw = (process.env.ADMIN_EMAILS ?? "").trim();
  if (!raw) return [];
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ email, password }));
}

/**
 * Idempotent admin bootstrap. Runs at server start.
 *
 * Sources (merged, ENV wins on conflict):
 *   1. File at  ADMIN_BOOTSTRAP_FILE  or  <cwd>/config/admins.json
 *   2. ENV      ADMIN_EMAILS=a@x.com,b@y.com  +  ADMIN_BOOTSTRAP_PASSWORD=...
 *
 * For each admin entry:
 *   - if a user with that email exists  → set role='admin' (no password change)
 *   - if no user exists                 → create the user (role='admin') using
 *                                          the supplied password.
 *                                         If no password is supplied for a NEW
 *                                         user, the entry is skipped with a
 *                                         warning (we never create accounts
 *                                         with empty/guessable passwords).
 *
 * Login and registration NEVER promote anyone to admin. Admin status can only
 * be granted via this bootstrap file or by an existing admin via the admin
 * panel.
 */
export async function seedAdmins(): Promise<void> {
  const file = process.env.ADMIN_BOOTSTRAP_FILE ?? DEFAULT_FILE;
  const fromFile = await readFromFile(file);
  const fromEnv = readFromEnv();
  // ENV entries override file entries with the same email.
  const merged = dedupe([...fromFile, ...fromEnv]);

  if (merged.length === 0) {
    logger.warn(
      { file },
      "[seedAdmins] no admin entries found — admin panel will be unreachable until at least one admin is seeded",
    );
    return;
  }

  let promoted = 0;
  let created = 0;
  let skipped = 0;

  for (const entry of merged) {
    try {
      const [existing] = await db
        .select({ id: usersTable.id, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.email, entry.email))
        .limit(1);

      if (existing) {
        if (existing.role !== "admin") {
          await db
            .update(usersTable)
            .set({ role: "admin" })
            .where(eq(usersTable.id, existing.id));
          promoted++;
          logger.info({ email: entry.email }, "[seedAdmins] promoted existing user to admin");
        }
        continue;
      }

      if (!entry.password || entry.password.length < 8) {
        skipped++;
        logger.warn(
          { email: entry.email },
          "[seedAdmins] cannot create admin user without a password (min 8 chars) — add a password in the bootstrap file or set ADMIN_BOOTSTRAP_PASSWORD",
        );
        continue;
      }

      const passwordHash = await hashPassword(entry.password);
      await db.insert(usersTable).values({
        email: entry.email,
        passwordHash,
        name: entry.name ?? null,
        role: "admin",
        status: "active",
        credits: 100,
      });
      created++;
      logger.info({ email: entry.email }, "[seedAdmins] created new admin user");
    } catch (err) {
      logger.error({ err, email: entry.email }, "[seedAdmins] failed to seed admin");
    }
  }

  logger.info(
    { total: merged.length, created, promoted, skipped },
    "[seedAdmins] bootstrap complete",
  );
}
