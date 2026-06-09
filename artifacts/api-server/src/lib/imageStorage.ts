import { objectStorageClient } from "./objectStorage";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { promises as fs, createReadStream, existsSync } from "fs";
import path from "path";

const LOCAL_DIR = path.resolve(process.cwd(), "uploads");

function hasObjectStorage(): boolean {
  return !!process.env.PRIVATE_OBJECT_DIR;
}

function getPrivateObjectDir(): string {
  return process.env.PRIVATE_OBJECT_DIR || "";
}

function parseBucketPath(p: string): { bucketName: string; objectName: string } {
  const norm = p.startsWith("/") ? p : `/${p}`;
  const parts = norm.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function ensureLocalDir(): Promise<void> {
  if (!existsSync(LOCAL_DIR)) {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
  }
}

/**
 * Upload a Buffer either to GCS (when PRIVATE_OBJECT_DIR is set) or to a local
 * uploads directory. Returns a normalized object path "/objects/uploads/<uuid>".
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  contentType = "image/png"
): Promise<string> {
  const objectId = randomUUID();

  if (hasObjectStorage()) {
    const fullPath = `${getPrivateObjectDir()}/uploads/${objectId}`;
    const { bucketName, objectName } = parseBucketPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, { metadata: { contentType }, resumable: false });
    return `/objects/uploads/${objectId}`;
  }

  await ensureLocalDir();
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  const filePath = path.join(LOCAL_DIR, `${objectId}.${ext}`);
  await fs.writeFile(filePath, buffer);
  await fs.writeFile(`${filePath}.meta`, contentType);
  return `/objects/uploads/${objectId}`;
}

/**
 * Stream a stored image back to the response.
 */
export async function streamStoredImage(
  objectPath: string
): Promise<{ stream: Readable; contentType: string } | null> {
  if (hasObjectStorage()) {
    const entityId = objectPath.replace(/^\/objects\//, "");
    const fullPath = `${getPrivateObjectDir()}/${entityId}`;
    const { bucketName, objectName } = parseBucketPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string) || "image/png";
    return { stream: file.createReadStream(), contentType };
  }

  const id = objectPath.replace(/^\/objects\/uploads\//, "");
  // Defence-in-depth: only allow UUID-shaped ids so the joined path can never
  // escape LOCAL_DIR via "../" or absolute paths.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  for (const ext of ["png", "jpg"]) {
    const fp = path.join(LOCAL_DIR, `${id}.${ext}`);
    if (existsSync(fp)) {
      let contentType = ext === "jpg" ? "image/jpeg" : "image/png";
      try {
        contentType = (await fs.readFile(`${fp}.meta`, "utf8")).trim() || contentType;
      } catch {}
      return { stream: createReadStream(fp), contentType };
    }
  }
  return null;
}

export function isStoragePath(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("/objects/");
}

export function storagePathToUrl(objectPath: string): string {
  return `/api/storage/images${objectPath}`;
}
