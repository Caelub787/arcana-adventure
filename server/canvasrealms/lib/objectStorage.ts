// Object-storage-backed adapter for Canvas Realms uploads.
//
// The standalone Canvas Realms app used Replit's GCS-backed object storage via
// the sidecar (PUBLIC_OBJECT_SEARCH_PATHS / PRIVATE_OBJECT_DIR). Earlier the host
// app had no provisioned bucket, so uploads were stored on the local filesystem
// under `cr-uploads/` — but local files are ephemeral on deploy and would be lost
// on redeploy/scale. This adapter now persists uploads in the provisioned bucket
// (durable across redeploys) while keeping the exact same public method surface
// the storage router relies on (newUpload / writeUpload / resolveObject / read
// stream) and the same `/objects/uploads/<uuid>` object paths, so neither the
// routes nor the client upload code need to change.

import type { StorageFileLike as File } from "../../replit_integrations/object_storage/types";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../../replit_integrations/object_storage";

// Uploads live under this prefix inside the bucket's private object directory.
const UPLOAD_PREFIX = "cr-uploads";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Create an R2 bucket and set PRIVATE_OBJECT_DIR " +
        "to a /<bucket>/<path> prefix.",
    );
  }
  return dir;
}

// Split a "/<bucket>/<object...>" path into its bucket name and object name.
function parseObjectPath(fullPath: string): {
  bucketName: string;
  objectName: string;
} {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = parts[1];
  const objectName = parts.slice(2).join("/");
  return { bucketName, objectName };
}

// Resolve a stored relative path ("uploads/<uuid>") to a GCS File handle,
// rejecting any path that escapes the upload prefix (defense against `../`
// traversal coming in through the wildcard GET route).
function fileForRelPath(rel: string): File {
  const clean = rel.replace(/^\/+/, "");
  if (clean.split("/").some((segment) => segment === "" || segment === "..")) {
    throw new ObjectNotFoundError();
  }
  let dir = getPrivateObjectDir();
  if (!dir.endsWith("/")) {
    dir = `${dir}/`;
  }
  const fullPath = `${dir}${UPLOAD_PREFIX}/${clean}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export interface ResolvedObject {
  file: File;
  contentType: string;
  size: number;
}

export class ObjectStorageService {
  // Allocate a new upload slot. The caller turns `uploadId` into an absolute
  // same-origin PUT URL; `objectPath` ("/objects/uploads/<uuid>") is the
  // canonical reference stored in the DB and later served via /api/storage.
  newUpload(): { uploadId: string; objectPath: string } {
    const id = randomUUID();
    return { uploadId: id, objectPath: `/objects/uploads/${id}` };
  }

  async writeUpload(
    uploadId: string,
    data: Buffer,
    contentType: string,
  ): Promise<void> {
    const file = fileForRelPath(`uploads/${uploadId}`);
    await file.save(data, {
      contentType,
      metadata: { contentType },
      resumable: false,
    });
  }

  // Map an objectPath ("/objects/uploads/<uuid>") to a GCS File plus its stored
  // content type and size. Throws ObjectNotFoundError when missing.
  async resolveObject(objectPath: string): Promise<ResolvedObject> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const rel = objectPath.slice("/objects/".length);
    const file = fileForRelPath(rel);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    const [metadata] = await file.getMetadata();
    const contentType =
      (metadata.contentType as string | undefined) ||
      "application/octet-stream";
    const size = Number(metadata.size ?? 0);
    return { file, contentType, size };
  }

  createReadStream(file: File): NodeJS.ReadableStream {
    return file.createReadStream();
  }
}
