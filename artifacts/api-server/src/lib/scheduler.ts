import { eq, and, lte, isNull } from "drizzle-orm";
import { db, postsTable, campaignsTable, socialAccountsTable } from "@workspace/db";
import { publishPost } from "./publisher";
import { logger } from "./logger";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(intervalMs = 60_000): void {
  if (schedulerInterval) return;

  logger.info({ intervalMs }, "Starting post scheduler");

  schedulerInterval = setInterval(async () => {
    await runScheduledPosts();
  }, intervalMs);

  setTimeout(async () => {
    await runScheduledPosts();
  }, 5000);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

async function runScheduledPosts(): Promise<void> {
  try {
    const now = new Date();

    const duePosts = await db
      .select()
      .from(postsTable)
      .where(and(
        lte(postsTable.scheduledAt, now),
        isNull(postsTable.publishedAt),
        eq(postsTable.publishStatus, "scheduled")
      ));

    if (duePosts.length === 0) return;

    logger.info({ count: duePosts.length }, "Processing due scheduled posts");

    for (const post of duePosts) {
      try {
        const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, post.campaignId));
        if (!campaign) continue;

        const accounts = await db
          .select()
          .from(socialAccountsTable)
          .where(and(
            eq(socialAccountsTable.brandId, campaign.brandId),
            eq(socialAccountsTable.platform, post.platform)
          ));

        if (accounts.length === 0) {
          logger.warn({ postId: post.id, platform: post.platform }, "No social account for platform, marking as failed");
          await db
            .update(postsTable)
            .set({ publishStatus: "failed", publishError: `No ${post.platform} account connected` })
            .where(eq(postsTable.id, post.id));
          continue;
        }

        const account = accounts[0];
        const result = await publishPost(
          account.platform,
          account.accessToken,
          account.accountId ?? account.id.toString(),
          account.pageId,
          { caption: post.caption, imageUrl: post.imageUrl, hashtags: post.hashtags }
        );

        await db
          .update(postsTable)
          .set({
            publishStatus: result.success ? "published" : "failed",
            publishedAt: result.success ? new Date() : null,
            publishError: result.error ?? null,
            externalPostId: result.externalPostId ?? null,
          })
          .where(eq(postsTable.id, post.id));

        logger.info({ postId: post.id, platform: post.platform, success: result.success }, "Post publish result");
      } catch (err) {
        logger.error({ postId: post.id, err }, "Error publishing post");
        await db
          .update(postsTable)
          .set({ publishStatus: "failed", publishError: String(err) })
          .where(eq(postsTable.id, post.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Scheduler run error");
  }
}
