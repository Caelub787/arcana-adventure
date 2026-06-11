---
name: Canvas Realms uploads storage
description: Where Canvas Realms World Builder image/file uploads are persisted and the contract the storage routes must keep.
---

Canvas Realms uploads are persisted in the provisioned Replit object storage
bucket (GCS via the sidecar client), NOT the local filesystem. Local disk was
ephemeral and dropped uploads on redeploy/scale.

**Why:** Deployed apps lose local files on redeploy; durable storage is required
to keep node images and realm art.

**How to apply:**
- The adapter `server/canvasrealms/lib/objectStorage.ts` stores objects under
  `<PRIVATE_OBJECT_DIR>/cr-uploads/uploads/<uuid>` and serves them back through
  the app's own GET routes (it does not use GCS public URLs / ACL).
- Keep the public method surface stable: `newUpload` / `writeUpload` /
  `resolveObject` (returns a GCS `File` on `.file`) / `createReadStream(file)`,
  and keep object paths as `/objects/uploads/<uuid>`.
- The client flow (`client/src/canvasrealms/lib/uploadImage.ts`) and the
  request-url -> PUT (`/api/storage/uploads/local/:id`) -> GET
  (`/api/storage/objects/*`) route contract must stay unchanged — bytes still go
  through the server, not a presigned GCS URL.
- Shared GCS client comes from `server/replit_integrations/object_storage`
  (App Storage blueprint). Requires PRIVATE_OBJECT_DIR /
  PUBLIC_OBJECT_SEARCH_PATHS env vars (set when the bucket is provisioned).
