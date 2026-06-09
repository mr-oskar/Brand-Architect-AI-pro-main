import { logger } from "./logger";

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  error?: string;
}

export interface PostPayload {
  caption: string;
  imageUrl?: string | null;
  hashtags?: string[];
}

async function publishToTwitter(token: string, payload: PostPayload): Promise<PublishResult> {
  const text = [payload.caption, ...(payload.hashtags ?? [])].join(" ").slice(0, 280);
  try {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json() as { data?: { id: string }; errors?: { message: string }[] };
    if (!res.ok) {
      return { success: false, error: data.errors?.[0]?.message ?? `Twitter error ${res.status}` };
    }
    return { success: true, externalPostId: data.data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function publishToLinkedIn(token: string, accountId: string, payload: PostPayload): Promise<PublishResult> {
  const text = [payload.caption, ...(payload.hashtags ?? [])].join("\n\n");
  try {
    const body: Record<string, unknown> = {
      author: `urn:li:person:${accountId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `LinkedIn error ${res.status}: ${err.slice(0, 200)}` };
    }
    const location = res.headers.get("x-restli-id") ?? res.headers.get("location") ?? undefined;
    return { success: true, externalPostId: location };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function publishToFacebook(token: string, pageId: string, payload: PostPayload): Promise<PublishResult> {
  const message = [payload.caption, ...(payload.hashtags ?? [])].join("\n\n");
  try {
    const params = new URLSearchParams({ message, access_token: token });
    if (payload.imageUrl) params.set("link", payload.imageUrl);

    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json() as { id?: string; error?: { message: string } };
    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message ?? `Facebook error ${res.status}` };
    }
    return { success: true, externalPostId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function publishToInstagram(token: string, pageId: string, payload: PostPayload): Promise<PublishResult> {
  if (!payload.imageUrl) {
    return { success: false, error: "Instagram requires an image" };
  }
  try {
    const caption = [payload.caption, ...(payload.hashtags ?? [])].join("\n\n");

    const createRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image_url: payload.imageUrl, caption, access_token: token }).toString(),
    });
    const createData = await createRes.json() as { id?: string; error?: { message: string } };
    if (!createRes.ok || !createData.id) {
      return { success: false, error: createData.error?.message ?? "Instagram media creation failed" };
    }

    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: createData.id, access_token: token }).toString(),
    });
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
    if (!publishRes.ok || !publishData.id) {
      return { success: false, error: publishData.error?.message ?? "Instagram publish failed" };
    }
    return { success: true, externalPostId: publishData.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function publishPost(
  platform: string,
  accessToken: string,
  accountId: string,
  pageId: string | null | undefined,
  payload: PostPayload
): Promise<PublishResult> {
  logger.info({ platform, accountId }, "Publishing post to social media");

  switch (platform) {
    case "twitter":
    case "x":
      return publishToTwitter(accessToken, payload);
    case "linkedin":
      return publishToLinkedIn(accessToken, accountId, payload);
    case "facebook":
      return publishToFacebook(accessToken, pageId ?? accountId, payload);
    case "instagram":
      return publishToInstagram(accessToken, pageId ?? accountId, payload);
    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
