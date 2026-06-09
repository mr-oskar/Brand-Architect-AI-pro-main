import httpx
from typing import Optional


class PublishResult:
    def __init__(self, success: bool, external_post_id: Optional[str] = None, error: Optional[str] = None):
        self.success = success
        self.external_post_id = external_post_id
        self.error = error

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "externalPostId": self.external_post_id,
            "error": self.error,
        }


def _publish_to_twitter(token: str, caption: str, hashtags: list) -> PublishResult:
    text = " ".join([caption] + (hashtags or []))[:280]
    try:
        resp = httpx.post(
            "https://api.twitter.com/2/tweets",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"text": text},
            timeout=15,
        )
        data = resp.json()
        if not resp.is_success:
            errors = data.get("errors", [{}])
            return PublishResult(False, error=errors[0].get("message", f"Twitter error {resp.status_code}"))
        return PublishResult(True, external_post_id=data.get("data", {}).get("id"))
    except Exception as e:
        return PublishResult(False, error=str(e))


def _publish_to_linkedin(token: str, account_id: str, caption: str, hashtags: list) -> PublishResult:
    text = "\n\n".join([caption] + (hashtags or []))
    body = {
        "author": f"urn:li:person:{account_id}",
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    try:
        resp = httpx.post(
            "https://api.linkedin.com/v2/ugcPosts",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
            },
            json=body,
            timeout=15,
        )
        if not resp.is_success:
            return PublishResult(False, error=f"LinkedIn error {resp.status_code}: {resp.text[:200]}")
        location = resp.headers.get("x-restli-id") or resp.headers.get("location")
        return PublishResult(True, external_post_id=location)
    except Exception as e:
        return PublishResult(False, error=str(e))


def _publish_to_facebook(token: str, page_id: str, caption: str, hashtags: list, image_url: Optional[str]) -> PublishResult:
    message = "\n\n".join([caption] + (hashtags or []))
    params = {"message": message, "access_token": token}
    if image_url:
        params["link"] = image_url
    try:
        resp = httpx.post(
            f"https://graph.facebook.com/v19.0/{page_id}/feed",
            data=params,
            timeout=15,
        )
        data = resp.json()
        if not resp.is_success or data.get("error"):
            return PublishResult(False, error=(data.get("error") or {}).get("message", f"Facebook error {resp.status_code}"))
        return PublishResult(True, external_post_id=data.get("id"))
    except Exception as e:
        return PublishResult(False, error=str(e))


def _publish_to_instagram(token: str, page_id: str, caption: str, hashtags: list, image_url: Optional[str]) -> PublishResult:
    if not image_url:
        return PublishResult(False, error="Instagram requires an image")
    full_caption = "\n\n".join([caption] + (hashtags or []))
    try:
        create_resp = httpx.post(
            f"https://graph.facebook.com/v19.0/{page_id}/media",
            data={"image_url": image_url, "caption": full_caption, "access_token": token},
            timeout=20,
        )
        create_data = create_resp.json()
        if not create_resp.is_success or not create_data.get("id"):
            return PublishResult(False, error=(create_data.get("error") or {}).get("message", "Instagram media creation failed"))

        publish_resp = httpx.post(
            f"https://graph.facebook.com/v19.0/{page_id}/media_publish",
            data={"creation_id": create_data["id"], "access_token": token},
            timeout=20,
        )
        publish_data = publish_resp.json()
        if not publish_resp.is_success or not publish_data.get("id"):
            return PublishResult(False, error=(publish_data.get("error") or {}).get("message", "Instagram publish failed"))
        return PublishResult(True, external_post_id=publish_data["id"])
    except Exception as e:
        return PublishResult(False, error=str(e))


def publish_post(
    platform: str,
    access_token: str,
    account_id: str,
    page_id: Optional[str],
    caption: str,
    image_url: Optional[str] = None,
    hashtags: Optional[list] = None,
) -> PublishResult:
    hashtags = hashtags or []
    platform = platform.lower()

    if platform in ("twitter", "x"):
        return _publish_to_twitter(access_token, caption, hashtags)
    elif platform == "linkedin":
        return _publish_to_linkedin(access_token, account_id, caption, hashtags)
    elif platform == "facebook":
        return _publish_to_facebook(access_token, page_id or account_id, caption, hashtags, image_url)
    elif platform == "instagram":
        return _publish_to_instagram(access_token, page_id or account_id, caption, hashtags, image_url)
    else:
        return PublishResult(False, error=f"Unsupported platform: {platform}")
