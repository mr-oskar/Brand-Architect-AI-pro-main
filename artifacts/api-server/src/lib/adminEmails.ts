import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";

// NOTE: Admin role is no longer derived from this list during login or
// registration. The bootstrap admins live in `config/admins.json` (see
// `lib/seedAdmins.ts`). This module now only powers the admin-panel UI that
// lets an existing admin manage a list of "known admin emails" stored in
// app_settings — promoting/demoting users from the panel still works through
// `routes/admin.ts::PUT /admin/settings`.

export const ADMIN_EMAILS_KEY = "adminEmails";

export async function getAdminEmails(): Promise<string[]> {
  try {
    const [row] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, ADMIN_EMAILS_KEY))
      .limit(1);
    if (row && Array.isArray(row.value)) {
      return (row.value as string[])
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean);
    }
  } catch {}
  return [];
}
