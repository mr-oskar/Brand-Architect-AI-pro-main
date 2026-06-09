import os
import re
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional, Tuple

LOCAL_DIR = Path(os.getcwd()) / "uploads"
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def _has_object_storage() -> bool:
    return bool(os.environ.get("PRIVATE_OBJECT_DIR"))


def _get_private_dir() -> str:
    return os.environ.get("PRIVATE_OBJECT_DIR", "")


def _ensure_local_dir():
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)


def upload_image_buffer(buf: bytes, content_type: str = "image/png") -> str:
    object_id = str(uuid.uuid4())

    if _has_object_storage():
        try:
            from google.cloud import storage as gcs

            full_path = f"{_get_private_dir()}/uploads/{object_id}"
            norm = full_path if full_path.startswith("/") else f"/{full_path}"
            parts = norm.split("/")
            bucket_name = parts[1]
            object_name = "/".join(parts[2:])
            client = gcs.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(object_name)
            blob.upload_from_string(buf, content_type=content_type)
            return f"/objects/uploads/{object_id}"
        except Exception:
            pass

    _ensure_local_dir()
    ext = "jpg" if "jpeg" in content_type else "png"
    file_path = LOCAL_DIR / f"{object_id}.{ext}"
    file_path.write_bytes(buf)
    (LOCAL_DIR / f"{object_id}.{ext}.meta").write_text(content_type)
    return f"/objects/uploads/{object_id}"


def stream_stored_image(object_path: str) -> Optional[Tuple[bytes, str]]:
    if _has_object_storage():
        try:
            from google.cloud import storage as gcs

            entity_id = object_path.lstrip("/objects/")
            full_path = f"{_get_private_dir()}/{entity_id}"
            norm = full_path if full_path.startswith("/") else f"/{full_path}"
            parts = norm.split("/")
            bucket_name = parts[1]
            object_name = "/".join(parts[2:])
            client = gcs.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(object_name)
            if not blob.exists():
                return None
            blob.reload()
            content_type = blob.content_type or "image/png"
            return blob.download_as_bytes(), content_type
        except Exception:
            return None

    image_id = object_path.replace("/objects/uploads/", "").strip("/")
    if not _UUID_RE.match(image_id):
        return None

    for ext in ["png", "jpg"]:
        fp = LOCAL_DIR / f"{image_id}.{ext}"
        if fp.exists():
            ct = "image/jpeg" if ext == "jpg" else "image/png"
            meta_path = LOCAL_DIR / f"{image_id}.{ext}.meta"
            if meta_path.exists():
                ct = meta_path.read_text().strip() or ct
            return fp.read_bytes(), ct

    return None


def is_storage_path(value: Optional[str]) -> bool:
    return isinstance(value, str) and value.startswith("/objects/")


def storage_path_to_url(object_path: str) -> str:
    return f"/api/storage/images{object_path}"
