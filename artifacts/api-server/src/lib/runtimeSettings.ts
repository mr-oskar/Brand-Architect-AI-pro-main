import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";

/**
 * Reads admin-configurable settings from the DB and pushes the relevant ones
 * into process.env so they take effect across the running app (AI clients, etc.).
 * Safe to call repeatedly; called at startup and after each settings save.
 */
export async function syncRuntimeSettings(): Promise<void> {
  try {
    const rows = await db.select().from(appSettingsTable);
    const map = new Map<string, any>(rows.map((r) => [r.key, r.value]));

    const ai = map.get("ai");
    if (ai && typeof ai === "object") {
      if (typeof (ai as any).imageModel === "string" && (ai as any).imageModel.trim()) {
        process.env.GEMINI_IMAGE_MODEL = (ai as any).imageModel.trim();
      }
      if (typeof (ai as any).textModel === "string" && (ai as any).textModel.trim()) {
        process.env.AI_TEXT_MODEL = (ai as any).textModel.trim();
      }
      if (typeof (ai as any).maxTokens === "number") {
        process.env.AI_MAX_TOKENS = String((ai as any).maxTokens);
      }
      if (typeof (ai as any).temperature === "number") {
        process.env.AI_TEMPERATURE = String((ai as any).temperature);
      }
    }
  } catch (e) {
    console.warn("[runtimeSettings] Failed to sync settings:", (e as any)?.message);
  }
}
