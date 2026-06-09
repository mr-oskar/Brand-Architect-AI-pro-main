import { sql, eq } from "drizzle-orm";
import { db, usersTable, appSettingsTable } from "@workspace/db";

export const DEFAULT_CREDIT_COSTS: Record<string, number> = {
  "brand.generate-kit": 50,
  "brand.generate-logo-variants": 40,
  "brand.generate-story": 10,
  "brand.generate-content": 5,
  "brand.generate-campaign": 60,
  "post.generate-image": 10,
  "post.regenerate": 8,
  "post.generate-variant": 5,
  "post.generate-content": 5,
  "design.generate-image": 10,
  "design.generate-layout": 6,
  "campaign.generate-all-images": 10,
};

export const DEFAULT_USER_CREDITS = 100;

export class InsufficientCreditsError extends Error {
  status = 402;
  constructor(public required: number, public available: number, public action: string) {
    super(`ليس لديك نقاط كافية لاستخدام هذه الميزة. المطلوب: ${required}، المتاح: ${available}`);
  }
}

let cachedCosts: Record<string, number> | null = null;
let cachedDefault: number | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

async function loadConfig(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && cachedCosts) return;
  const rows = await db.select().from(appSettingsTable);
  const map: Record<string, any> = {};
  for (const r of rows) map[r.key] = r.value;
  cachedCosts = { ...DEFAULT_CREDIT_COSTS, ...((map.creditCosts as Record<string, number>) ?? {}) };
  cachedDefault = typeof map.defaultUserCredits === "number" ? map.defaultUserCredits : DEFAULT_USER_CREDITS;
  cacheLoadedAt = Date.now();
}

export function invalidateCreditsCache(): void {
  cachedCosts = null;
  cachedDefault = null;
  cacheLoadedAt = 0;
}

export async function getCostFor(action: string): Promise<number> {
  await loadConfig();
  return cachedCosts?.[action] ?? DEFAULT_CREDIT_COSTS[action] ?? 1;
}

export async function getDefaultCredits(): Promise<number> {
  await loadConfig();
  return cachedDefault ?? DEFAULT_USER_CREDITS;
}

export async function getCredits(userId: string): Promise<number> {
  const [u] = await db.select({ credits: usersTable.credits }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.credits ?? 0;
}

/**
 * Atomically deducts credits. Throws InsufficientCreditsError if not enough.
 * Admins (role=admin) are exempt and pay nothing.
 */
export async function chargeCredits(userId: string, action: string, multiplier: number = 1): Promise<{ charged: number; remaining: number }> {
  const [u] = await db.select({ role: usersTable.role, credits: usersTable.credits }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) throw new InsufficientCreditsError(0, 0, action);
  if (u.role === "admin") return { charged: 0, remaining: u.credits };

  const baseCost = await getCostFor(action);
  const cost = Math.max(0, Math.ceil(baseCost * Math.max(1, multiplier)));
  if (cost === 0) return { charged: 0, remaining: u.credits };

  // Atomic conditional update
  const updated = await db
    .update(usersTable)
    .set({ credits: sql`${usersTable.credits} - ${cost}` })
    .where(sql`${usersTable.id} = ${userId} AND ${usersTable.credits} >= ${cost}`)
    .returning({ credits: usersTable.credits });

  if (!updated.length) {
    throw new InsufficientCreditsError(cost, u.credits, action);
  }
  return { charged: cost, remaining: updated[0].credits };
}

export async function refundCredits(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await db.update(usersTable).set({ credits: sql`${usersTable.credits} + ${amount}` }).where(eq(usersTable.id, userId));
}

export async function setCredits(userId: string, amount: number): Promise<number> {
  const safe = Math.max(0, Math.floor(amount));
  const [u] = await db.update(usersTable).set({ credits: safe }).where(eq(usersTable.id, userId)).returning({ credits: usersTable.credits });
  return u?.credits ?? 0;
}

export async function addCredits(userId: string, delta: number): Promise<number> {
  const [u] = await db
    .update(usersTable)
    .set({ credits: sql`GREATEST(0, ${usersTable.credits} + ${Math.floor(delta)})` })
    .where(eq(usersTable.id, userId))
    .returning({ credits: usersTable.credits });
  return u?.credits ?? 0;
}
