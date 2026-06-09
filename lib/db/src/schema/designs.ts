import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { brandsTable } from "./brands";

export const designsTable = pgTable("designs", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").references(() => brandsTable.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  name: text("name").notNull().default("Untitled Design"),
  canvasData: jsonb("canvas_data"),
  width: integer("width").notNull().default(794),
  height: integer("height").notNull().default(1123),
  preset: text("preset").default("a4"),
  previewUrl: text("preview_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Design = typeof designsTable.$inferSelect;
