import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  caption: text("caption").notNull(),
  hook: text("hook").notNull(),
  cta: text("cta").notNull(),
  hashtags: text("hashtags").array().notNull().default([]),
  imagePrompt: text("image_prompt").notNull(),
  imageUrl: text("image_url"),
  imageHistory: jsonb("image_history").$type<Array<{ url: string; prompt?: string; createdAt: string }>>().notNull().default([]),
  platform: text("platform").notNull().default("instagram"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishStatus: text("publish_status").notNull().default("draft"),
  publishError: text("publish_error"),
  externalPostId: text("external_post_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
