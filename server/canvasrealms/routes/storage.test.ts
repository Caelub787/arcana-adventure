import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { Readable } from "stream";
import express from "express";

// ===========================================================================
// MANUAL CHECK (real-bucket persistence across an actual redeploy)
// ---------------------------------------------------------------------------
// These tests guard the persistence *contract* with a fake bucket. To confirm
// the real GCS-backed bucket survives a redeploy, do this once after any change
// to the storage adapter/routes or the object-storage provisioning:
//   1. Open the World Builder (Canvas Realms) and upload an image to a node.
//   2. Confirm it renders (served from /api/storage/objects/uploads/<uuid>).
//   3. Redeploy the app (Publish / new deployment), then reload the realm.
//   4. The image must still load — bytes live in the provisioned bucket
//      (PRIVATE_OBJECT_DIR/cr-uploads/...), not on the ephemeral local disk.
// If it 404s after redeploy, PRIVATE_OBJECT_DIR is unset/changed or the adapter
// regressed to local-disk storage.
// ===========================================================================

// ---------------------------------------------------------------------------
// In-memory stand-in for the Replit object-storage (GCS) client. The Canvas
// Realms upload adapter only ever reaches storage through
// `objectStorageClient.bucket(name).file(name)`, so we replace that module with
// a fake bucket whose File handles read/write an in-memory Map. This lets us
// exercise the real adapter + route code (the persistence contract) without a
// provisioned bucket. Keyed by `${bucket}/${object}`.
// ---------------------------------------------------------------------------

type StoredObject = { data: Buffer; contentType: string };

const objectStore = new Map<string, StoredObject>();

function key(bucket: string, object: string): string {
  return `${bucket}/${object}`;
}

function makeFile(bucket: string, object: string) {
  const k = key(bucket, object);
  return {
    async save(
      data: Buffer,
      opts: { contentType?: string; metadata?: { contentType?: string } },
    ): Promise<void> {
      const contentType =
        opts?.contentType ||
        opts?.metadata?.contentType ||
        "application/octet-stream";
      objectStore.set(k, { data: Buffer.from(data), contentType });
    },
    async exists(): Promise<[boolean]> {
      return [objectStore.has(k)];
    },
    async getMetadata(): Promise<[{ contentType: string; size: number }]> {
      const entry = objectStore.get(k);
      if (!entry) return [{ contentType: "application/octet-stream", size: 0 }];
      return [{ contentType: entry.contentType, size: entry.data.length }];
    },
    createReadStream(): NodeJS.ReadableStream {
      const entry = objectStore.get(k);
      return Readable.from(entry ? entry.data : Buffer.alloc(0));
    },
  };
}

vi.mock("../../replit_integrations/object_storage", () => ({
  objectStorageClient: {
    bucket(bucketName: string) {
      return {
        file(objectName: string) {
          return makeFile(bucketName, objectName);
        },
      };
    },
  },
}));

// Imported after the mock is registered so the adapter binds to the fake client.
import storageRouter from "./storage";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";

const PREV_PRIVATE_OBJECT_DIR = process.env.PRIVATE_OBJECT_DIR;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.PRIVATE_OBJECT_DIR = "/test-bucket/.private";

  const app = express();
  app.use(express.json());
  // The real host attaches a pino logger to each request; the routes call
  // `req.log.error(...)`, so provide a no-op stand-in.
  app.use((req, _res, next) => {
    (req as unknown as { log: { error: () => void } }).log = {
      error: () => {},
    };
    next();
  });
  app.use("/api", storageRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (PREV_PRIVATE_OBJECT_DIR === undefined) {
    delete process.env.PRIVATE_OBJECT_DIR;
  } else {
    process.env.PRIVATE_OBJECT_DIR = PREV_PRIVATE_OBJECT_DIR;
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  objectStore.clear();
});

describe("Canvas Realms storage routes — persistence contract", () => {
  it("round-trips bytes + content-type through request-url -> PUT -> GET", async () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
      0xff, 0xfe, 0xfd, 0xfc,
    ]);

    // 1. Allocate an upload slot.
    const reqRes = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "hero.png",
        size: pngBytes.length,
        contentType: "image/png",
      }),
    });
    expect(reqRes.status).toBe(200);
    const { uploadURL, objectPath } = (await reqRes.json()) as {
      uploadURL: string;
      objectPath: string;
    };
    expect(objectPath).toMatch(/^\/objects\/uploads\/[a-f0-9-]+$/);
    expect(uploadURL).toMatch(/^http:\/\/.+\/api\/storage\/uploads\/local\//);

    // 2. PUT the raw bytes to the allocated URL.
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: pngBytes,
    });
    expect(putRes.status).toBe(200);

    // 3. GET the object back via the served path; bytes + type must match.
    const getRes = await fetch(`${baseUrl}/api/storage${objectPath}`);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toBe("image/png");
    const got = Buffer.from(await getRes.arrayBuffer());
    expect(got.equals(pngBytes)).toBe(true);
  });

  it("simulates persistence across a redeploy (objectStore survives a fresh router)", async () => {
    // Write through the route, then resolve through a brand-new service
    // instance — the bytes live in the bucket, not in any per-process state, so
    // a redeploy (new process) still serves them.
    const reqRes = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "map.jpg",
        size: 4,
        contentType: "image/jpeg",
      }),
    });
    const { objectPath, uploadURL } = (await reqRes.json()) as {
      objectPath: string;
      uploadURL: string;
    };
    const bytes = Buffer.from([1, 2, 3, 4]);
    await fetch(uploadURL, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: bytes,
    });

    const freshService = new ObjectStorageService();
    const resolved = await freshService.resolveObject(objectPath);
    expect(resolved.contentType).toBe("image/jpeg");
    expect(resolved.size).toBe(4);
  });

  it("returns 404 for a missing object", async () => {
    const getRes = await fetch(
      `${baseUrl}/api/storage/objects/uploads/does-not-exist`,
    );
    expect(getRes.status).toBe(404);
  });

  it("rejects an invalid upload id on PUT", async () => {
    const putRes = await fetch(
      `${baseUrl}/api/storage/uploads/local/not_a_valid_id!`,
      {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: Buffer.from([1]),
      },
    );
    expect(putRes.status).toBe(400);
  });

  it("rejects an empty upload body on PUT", async () => {
    const reqRes = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x.png", size: 1, contentType: "image/png" }),
    });
    const { uploadURL } = (await reqRes.json()) as { uploadURL: string };
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: Buffer.alloc(0),
    });
    expect(putRes.status).toBe(400);
  });
});

describe("Canvas Realms storage adapter — path traversal", () => {
  let service: ObjectStorageService;

  beforeAll(() => {
    service = new ObjectStorageService();
  });

  it("rejects `..` traversal in resolveObject", async () => {
    await expect(
      service.resolveObject("/objects/uploads/../../../etc/passwd"),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("rejects an empty segment in resolveObject", async () => {
    await expect(
      service.resolveObject("/objects/uploads//secret"),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("rejects a path outside the /objects/ root", async () => {
    await expect(service.resolveObject("/etc/passwd")).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });
});
