import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PassThrough, type Readable } from "node:stream";
import { Response } from "express";
import { randomUUID } from "crypto";
import type { StorageFileLike } from "./types";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// Cloudflare R2 is S3-compatible, so it's accessed through the AWS S3 SDK
// pointed at R2's endpoint, with path-style addressing (matches the
// GCS-style "/<bucket>/<object>" URLs this module already parses).
function createR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set. " +
        "Create an R2 bucket and API token in the Cloudflare dashboard."
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const s3 = createR2Client();
const R2_ENDPOINT_PREFIX = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/`;

// One object in the bucket. Implements the same handful of methods the rest
// of this file (and its Canvas Realms duplicate) used from GCS's File class.
class R2File implements StorageFileLike {
  constructor(
    private readonly bucketName: string,
    public readonly name: string
  ) {}

  async exists(): Promise<[boolean]> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: this.name }));
      return [true];
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
        return [false];
      }
      throw err;
    }
  }

  async getMetadata(): Promise<
    [{ contentType?: string; size?: number; metadata?: Record<string, string> }]
  > {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: this.bucketName, Key: this.name })
    );
    return [
      {
        contentType: head.ContentType,
        size: head.ContentLength,
        metadata: head.Metadata,
      },
    ];
  }

  async setMetadata(opts: { metadata: Record<string, string> }): Promise<void> {
    // S3-compatible storage has no in-place metadata patch — copy the object
    // onto itself with the merged metadata and MetadataDirective: REPLACE.
    const [current] = await this.getMetadata();
    await s3.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        CopySource: `${this.bucketName}/${encodeURIComponent(this.name)}`,
        ContentType: current.contentType,
        Metadata: { ...current.metadata, ...opts.metadata },
        MetadataDirective: "REPLACE",
      })
    );
  }

  createReadStream(): NodeJS.ReadableStream {
    const pass = new PassThrough();
    s3.send(new GetObjectCommand({ Bucket: this.bucketName, Key: this.name }))
      .then((res) => {
        const body = res.Body as Readable;
        body.on("error", (err) => pass.emit("error", err));
        body.pipe(pass);
      })
      .catch((err) => pass.emit("error", err));
    return pass;
  }

  async save(
    data: Buffer,
    opts?: { contentType?: string; metadata?: Record<string, string>; resumable?: boolean }
  ): Promise<void> {
    await s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        Body: data,
        ContentType: opts?.contentType,
        Metadata: opts?.metadata,
      })
    );
  }

  async getSignedUrl(opts: {
    version?: string;
    action: "read" | "write" | "delete";
    expires: number;
  }): Promise<[string]> {
    const command =
      opts.action === "write"
        ? new PutObjectCommand({ Bucket: this.bucketName, Key: this.name })
        : new GetObjectCommand({ Bucket: this.bucketName, Key: this.name });
    const ttlSec = Math.max(1, Math.round((opts.expires - Date.now()) / 1000));
    const url = await getSignedUrl(s3, command, { expiresIn: ttlSec });
    return [url];
  }
}

class R2Bucket {
  constructor(private readonly bucketName: string) {}
  file(objectName: string): R2File {
    return new R2File(this.bucketName, objectName);
  }
}

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = {
  bucket(bucketName: string): R2Bucket {
    return new R2Bucket(bucketName);
  },
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create an R2 bucket and set " +
          "PUBLIC_OBJECT_SEARCH_PATHS to a comma-separated list of /<bucket>/<path> prefixes."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create an R2 bucket and set PRIVATE_OBJECT_DIR " +
          "to a /<bucket>/<path> prefix."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<StorageFileLike | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: StorageFileLike, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create an R2 bucket and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<StorageFileLike> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    if (!rawPath.startsWith(R2_ENDPOINT_PREFIX)) {
      return rawPath;
    }

    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageFileLike;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const action =
    method === "PUT"
      ? "write"
      : method === "DELETE"
        ? "delete"
        : "read";
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const [signedURL] = await file.getSignedUrl({
    version: "v4",
    action,
    expires: Date.now() + ttlSec * 1000,
  });
  return signedURL;
}
