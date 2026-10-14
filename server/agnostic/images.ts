// Pictures for Agnostic sheets live in the database (agnostic_images), not on the
// server's disk: the host's disk is wiped on every restart and redeploy, so files
// saved there vanish for everyone (the uploader keeps seeing a cached copy).
// Each picture is WebP, with a small thumbnail that lists, cards and tokens load
// first. Served at /api/ag-image/:id (?thumb=1), cached by browsers for good —
// a picture never changes; a new one gets a new id.
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { agnosticImages } from "@shared/agnostic-schema";

export const AG_IMAGE_PREFIX = "/api/ag-image/";
const MAX_DIM = 1600;
const THUMB = 128;

/** Store a picture; returns the URL sheets use. */
export async function saveAgImage(buffer: Buffer): Promise<string> {
  const img = sharp(buffer, { failOn: "none" }).rotate();
  const full = await img.clone().resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  const thumb = await img.clone().resize({ width: THUMB, height: THUMB, fit: "cover" }).webp({ quality: 75 }).toBuffer();
  const id = randomUUID().replace(/-/g, "");
  await db.insert(agnosticImages).values({ id, mime: "image/webp", data: full.toString("base64"), thumb: thumb.toString("base64") });
  return `${AG_IMAGE_PREFIX}${id}`;
}

/** A data: URL (pasted, or from the image library) stored as a picture. */
export async function saveAgImageDataUrl(dataUrl: string): Promise<string> {
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Not an image");
  return saveAgImage(Buffer.from(m[1], "base64"));
}

// Recently served pictures, so a table full of the same portraits isn't a database read each.
const recent = new Map<string, { mime: string; buf: Buffer }>();
const RECENT_MAX = 300;

export function registerAgImageRoutes(app: Express, requireAuth: (req: Request, res: Response, next: () => void) => void) {
  app.get(`${AG_IMAGE_PREFIX}:id`, async (req, res) => {
    const id = String(req.params.id).replace(/[^a-z0-9]/gi, "");
    const thumb = req.query.thumb === "1";
    const key = `${id}:${thumb ? "t" : "f"}`;
    try {
      let hit = recent.get(key);
      if (!hit) {
        const [row] = await db.select().from(agnosticImages).where(eq(agnosticImages.id, id)).limit(1);
        if (!row) return res.status(404).end();
        const b64 = thumb && row.thumb ? row.thumb : row.data;
        hit = { mime: row.mime, buf: Buffer.from(b64, "base64") };
        recent.set(key, hit);
        if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value!);
      }
      res.setHeader("Content-Type", hit.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.end(hit.buf);
    } catch (e) {
      console.error("[agnostic] couldn't serve image", e);
      res.status(500).end();
    }
  });
  // Upload (a file read in the browser, or an image library pick): { data: "data:image/…;base64,…" } → { url }.
  app.post("/api/agnostic/image", requireAuth as any, async (req, res) => {
    try {
      const data = typeof req.body?.data === "string" ? req.body.data : "";
      if (data.length > 40_000_000) return res.status(413).json({ error: "That picture is too big" });
      res.json({ url: await saveAgImageDataUrl(data) });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Couldn't save that picture" });
    }
  });
}
