import express, { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Build an absolute, same-origin URL for the host. RequestUploadUrlResponse
// requires uploadURL to be a valid absolute URL (zod .url()), and the page is
// served over https on Replit, so we honor x-forwarded-proto to avoid
// mixed-content blocking when the browser PUTs the file.
function absoluteUrl(req: Request, pathname: string): string {
  const fwd = (req.headers["x-forwarded-proto"] as string | undefined)
    ?.split(",")[0]
    ?.trim();
  const proto = fwd || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}${pathname}`;
}

/**
 * POST /storage/uploads/request-url
 *
 * Allocate an upload slot. Returns an absolute same-origin PUT URL plus the
 * canonical objectPath to store. The client then PUTs the file bytes directly
 * to uploadURL (see PUT /storage/uploads/local/:id below).
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const { uploadId, objectPath } = objectStorageService.newUpload();
    const uploadURL = absoluteUrl(req, `/api/storage/uploads/local/${uploadId}`);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/uploads/local/:id
 *
 * Receive the raw file bytes for a previously-allocated upload slot and persist
 * them to the local object store. The host's global JSON body parser ignores
 * non-JSON content types, so we scope a raw body parser to this route.
 */
router.put(
  "/storage/uploads/local/:id",
  express.raw({ type: () => true, limit: "25mb" }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!/^[a-f0-9-]+$/i.test(id)) {
        res.status(400).json({ error: "Invalid upload id" });
        return;
      }
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Empty upload body" });
        return;
      }
      const rawType = req.headers["content-type"];
      const contentType = Array.isArray(rawType)
        ? rawType[0]
        : rawType || "application/octet-stream";
      await objectStorageService.writeUpload(id, body, contentType);
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, "Error storing upload");
      res.status(500).json({ error: "Failed to store upload" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve a stored object by its objectPath. Express 4 captures the wildcard tail
 * into req.params[0].
 */
router.get("/storage/objects/*", async (req: Request, res: Response) => {
  try {
    const wildcardPath = (req.params as Record<string, string>)[0] || "";
    const { file, contentType, size } =
      await objectStorageService.resolveObject(`/objects/${wildcardPath}`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "private, max-age=3600");
    objectStorageService.createReadStream(file).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * The local adapter has no separate public bucket; public assets are served
 * from the same object root. Returns 404 when not found.
 */
router.get("/storage/public-objects/*", async (req: Request, res: Response) => {
  try {
    const wildcardPath = (req.params as Record<string, string>)[0] || "";
    const { file, contentType, size } =
      await objectStorageService.resolveObject(`/objects/${wildcardPath}`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "public, max-age=3600");
    objectStorageService.createReadStream(file).pipe(res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;
