import {
  pgTable, text, integer, boolean, jsonb, timestamp, uuid, serial, bigint, index,
} from "drizzle-orm/pg-core";

/* ─────────────── Pages: per-page settings ─────────────── */
export const pagesTable = pgTable("pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  requireAuth: boolean("require_auth").notNull().default(true),
  requiredPlan: text("required_plan"), // null = any plan
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  ogImage: text("og_image"),
  noticeHtml: text("notice_html"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Page = typeof pagesTable.$inferSelect;

/* ─────────────── Plans & Subscriptions ─────────────── */
export const plansTable = pgTable("plans", {
  id: text("id").primaryKey(), // e.g. "free", "pro", "business"
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  interval: text("interval").notNull().default("month"), // month|year|once
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // limits: { brands, campaignsPerMonth, postsPerMonth, imagesPerMonth, aiTokensPerMonth, apiCallsPerDay }
  limits: jsonb("limits").$type<Record<string, number>>().notNull().default({}),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Plan = typeof plansTable.$inferSelect;

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull().default("active"), // active|past_due|canceled|trialing
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("subs_user_idx").on(t.userId),
}));
export type Subscription = typeof subscriptionsTable.$inferSelect;

/* ─────────────── Usage events (per-request) ─────────────── */
export const usageEventsTable = pgTable("usage_events", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id"),
  kind: text("kind").notNull(), // api|ai_text|ai_image|publish|login|signup
  route: text("route"),
  method: text("method"),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  tokensUsed: integer("tokens_used").notNull().default(0),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCreated: index("usage_created_idx").on(t.createdAt),
  byUserCreated: index("usage_user_created_idx").on(t.userId, t.createdAt),
  byKind: index("usage_kind_idx").on(t.kind),
}));
export type UsageEvent = typeof usageEventsTable.$inferSelect;

/* ─────────────── API Keys ─────────────── */
export const apiKeysTable = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(), // first 8 chars, shown to user
  hash: text("hash").notNull(), // sha256 of full key
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("apikeys_user_idx").on(t.userId),
  byPrefix: index("apikeys_prefix_idx").on(t.prefix),
}));
export type ApiKey = typeof apiKeysTable.$inferSelect;

/* ─────────────── Webhooks (events outbound) ─────────────── */
export const webhooksTable = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secret: text("secret"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Webhook = typeof webhooksTable.$inferSelect;
