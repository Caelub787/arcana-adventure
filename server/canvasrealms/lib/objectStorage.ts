// Local-filesystem object storage adapter.
//
// The standalone Canvas Realms app used Replit's GCS-backed object storage via
// the sidecar (PUBLIC_OBJECT_SEARCH_PATHS / PRIVATE_OBJECT_DIR). The host app
// has no provisioned bucket, so this adapter stores uploaded files on the local
// filesystem under `cr-uploads/` and serves them back through the same
// `/api/storage/objects/...` routes. The public method surface mirrors what the
// storage router needs (newUpload / writeUpload / resolveObject / read stream).

import { promises as fs, createReadStream, type ReadStream } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_ROOT = path.resolve(process.cwd(), "cr-uploads");

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Resolve a stored relative path against STORAGE_ROOT, rejecting any path that
// escapes the root (defense against `../` traversal in the wildcard route).
function safeJoin(rel: string): string {
  const normalized = rel.startsWith("/") ? rel : `/${rel}`;
  const target = path.resolve(STORAGE_ROOT, `.${normalized}`);
  if (target !== STORAGE_ROOT && !target.startsWith(STORAGE_ROOT + path.sep)) {
    throw new ObjectNotFoundError();
  }
  return target;
}

export interface ResolvedObject {
  filePath: string;
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
    const dir = path.join(STORAGE_ROOT, "uploads");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, uploadId);
    await fs.writeFile(file, data);
    await fs.writeFile(
      `${file}.meta`,
      JSON.stringify({ contentType, size: data.length }),
    );
  }

  // Map an objectPath ("/objects/uploads/<uuid>") to a file on disk plus its
  // stored content type. Throws ObjectNotFoundError when missing.
  async resolveObject(objectPath: string): Promise<ResolvedObject> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const rel = objectPath.slice("/objects/".length);
    const filePath = safeJoin(rel);
    let size: number;
    try {
      const stat = await fs.stat(filePath);
      size = stat.size;
    } catch {
      throw new ObjectNotFoundError();
    }
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.readFile(`${filePath}.meta`, "utf8"));
      if (meta && typeof meta.contentType === "string") {
        contentType = meta.contentType;
      }
      if (meta && typeof meta.size === "number") {
        size = meta.size;
      }
    } catch {
      // Missing/corrupt sidecar metadata is non-fatal; fall back to defaults.
    }
    return { filePath, contentType, size };
  }

  createReadStream(filePath: string): ReadStream {
    return createReadStream(filePath);
  }
}
