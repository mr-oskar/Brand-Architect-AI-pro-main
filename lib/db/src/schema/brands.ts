import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  companyName: text("company_name").notNull(),
  companyDescription: text("company_description").notNull(),
  industry: text("industry").notNull(),
  websiteUrl: text("website_url"),
  logoUrl: text("logo_url"),
  logoVariants: jsonb("logo_variants"),
  status: text("status").notNull().default("draft"),
  brandKit: jsonb("brand_kit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBrandSchema = createInsertSchema(brandsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brandsTable.$inferSelect;
