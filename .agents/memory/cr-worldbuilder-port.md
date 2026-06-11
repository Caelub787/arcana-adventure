---
name: Canvas Realms World Builder port
description: How the ported Canvas Realms (CR) app backs both World Builder entry points, and why the campaign embed is keyed by campaignId.
---

# Canvas Realms = the World Builder

The home-grown World Builder (standalone `/worldbuilder` page + campaign-embedded
`WorldBuilderContent`) was replaced by a port of the standalone Canvas Realms app.
Clerk auth was swapped for host session auth (`req.session.userId`).

- Standalone entry: `/worldbuilder` redirects to `/app` (CR routes). CR API mounted at `/api`.
- CR module lives in `client/src/canvasrealms/**` (alias `@cr`) and `server/canvasrealms/**`;
  CR tables in `shared/cr-schema.ts`; `@workspace/db` is a host shim.

## Campaign embed is keyed by campaignId, NOT a host world

`CampaignWorldBuilder` → `EmbeddedWorldBuilder({ campaignId })` calls
`POST /api/campaigns/:campaignId/realm` (get-or-create a CR realm whose `id === campaignId`,
owner = `campaign.gmUserId`). The GM auto-provisions it on first open; members inherit access.

**Why:** the earlier attempt keyed the campaign realm by a linked *host* `world` id and read
`useLinkedWorld`. But host-world *creation* UI lived in the old WB that this task removed, so a
campaign with no pre-existing linked world could never open the canvas — a dead end. Keying by
campaign removes that dependency entirely.

**How to apply:** CR realm access for embedded realms is bridged in
`resolveRealmRole` (`server/canvasrealms/middlewares/auth.ts`) via
`checkCampaignAccessShared` (GM/assistant/admin → editor; member → viewer) in
`server/worldAccess.ts`. A legacy `checkWorldAccessShared` world-id bridge is kept for
defensiveness but is not used by the current embed path. Standalone realms match neither and
fall through to owner/collaborator checks only.

## Object storage + Compass

Object storage uses a LOCAL-FILESYSTEM adapter (root `cr-uploads/`) in
`server/canvasrealms/lib/objectStorage.ts` + `routes/storage.ts`. Express is 4.x → wildcard
params are `req.params[0]` (NOT `*path`); `RequestUploadUrlResponse.uploadURL` is zod `.url()`
so the upload URL MUST be absolute (build from `x-forwarded-proto`). Compass degrades cleanly
when no OpenAI/ElevenLabs env is present (`openai` is null, every route guards `if(!openai)`).
