# Arcana Adventure ↔ Partner App Integration Guide

This document is the integration contract for partner apps that want to
keep their library in sync with Arcana Adventure (AA). The reference
partner is **CanvasRealms**, but anything that can speak OAuth 2.0 +
HTTPS works.

---

## 1. What gets synced

The following entity kinds are mirrored bidirectionally:

| Kind                   | Sync path                                    |
|------------------------|----------------------------------------------|
| `item`                 | `/api/sync/v1/items`                         |
| `spell`                | `/api/sync/v1/spells`                        |
| `character`            | `/api/sync/v1/characters`                    |
| `species`              | `/api/sync/v1/species`                       |
| `class`                | `/api/sync/v1/classes`                       |
| `feat-tree`            | `/api/sync/v1/feat-trees`                    |
| `character-template`   | `/api/sync/v1/character-templates`           |
| `roll-template`        | `/api/sync/v1/roll-templates`                |

### Library routing (where writes land)

- **Admin user → global Admin library** (`ownerCol = NULL`).
- **Any other user → personal AA V2 library** for that user, and
  `system` is forced to `'aa-v2'`.

The token user determines this — partner apps don't pick a routing
mode. The `/api/sync/v1/me` endpoint returns the resolved
`libraryRouting`.

---

## 2. OAuth 2.0 (Authorization Code + PKCE)

Standard OAuth 2.0 with PKCE.

### Endpoints

- `GET  /oauth/authorize` — renders an Arcana-branded consent screen.
- `POST /oauth/authorize/decision` — internal (the consent form posts to it).
- `POST /oauth/token` — exchanges code (or refresh token) for tokens.
- `POST /oauth/revoke` — revokes a token (client-authenticated).
- `GET  /oauth/userinfo` — returns the bearer user's profile.

### Scopes

| Scope               | Grants                                      |
|---------------------|---------------------------------------------|
| `library:read`      | All `GET /api/sync/v1/*`                    |
| `library:write`     | All `POST/PATCH/DELETE /api/sync/v1/*`      |
| `webhooks:manage`   | Manage outbound webhook subscriptions       |

### Authorize URL example (PKCE S256)

```
GET https://arcana.replit.app/oauth/authorize?
  response_type=code&
  client_id=canvasrealms&
  redirect_uri=https%3A%2F%2Fcanvasrealms.com%2Foauth%2Fcallback&
  scope=library%3Aread%20library%3Awrite%20webhooks%3Amanage&
  state=<random>&
  code_challenge=<base64url(sha256(verifier))>&
  code_challenge_method=S256
```

If the user is not signed in, AA redirects them to its login page and
back here after auth.

### Token exchange

```
POST /oauth/token   (application/x-www-form-urlencoded)

grant_type=authorization_code
code=<code>
redirect_uri=<same as authorize>
client_id=canvasrealms
client_secret=<from CANVASREALMS_CLIENT_SECRET>
code_verifier=<original verifier>
```

Response:

```json
{
  "access_token": "<opaque>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<opaque>",
  "scope": "library:read library:write webhooks:manage"
}
```

Refresh tokens rotate on every refresh. Access tokens last 1 hour;
refresh tokens last 30 days.

### CanvasRealms client

Pre-seeded at server boot:

- `client_id`: `canvasrealms`
- Allowed redirect URIs: `https://canvasrealms.com/oauth/callback`,
  `http://localhost:5000/oauth/callback`
- Allowed scopes: all three above
- Secret: env var `CANVASREALMS_CLIENT_SECRET` (generated and logged
  once on first boot if missing — copy it into Replit secrets).

---

## 3. Sync API

All endpoints live under `/api/sync/v1/` and require
`Authorization: Bearer <access_token>`.

### Common request headers

- `X-Sync-Origin: <your client_id>` — suppresses outbound webhook
  fanout to your own webhook endpoint, preventing delivery loops.
- `X-External-Updated-At: <ISO timestamp>` — your source-of-truth
  timestamp for the row. AA compares this against its internal
  `updatedAt`; if AA's copy is newer, the write is **stale-skipped**
  and the response includes `{ "skipped": "stale", ... }`.

### Endpoints (per entity kind, e.g. `item`)

| Method  | Path                                                | Purpose                                  |
|---------|-----------------------------------------------------|------------------------------------------|
| GET     | `/api/sync/v1/items`                                | List all visible items for token user    |
| GET     | `/api/sync/v1/items/{id}`                           | Get by AA internal id                    |
| GET     | `/api/sync/v1/items/by-external/{externalId}`       | Get by your external id (after upsert)   |
| POST    | `/api/sync/v1/items`                                | Create or upsert (use `externalId`)      |
| PATCH   | `/api/sync/v1/items/{id}`                           | Patch by AA internal id                  |
| DELETE  | `/api/sync/v1/items/{id}`                           | Delete                                   |

### Upsert flow

```
POST /api/sync/v1/items
{
  "externalId": "cr_item_42",
  "externalUpdatedAt": "2026-05-13T10:00:00Z",
  "name": "Sunblade",
  "itemType": "weapon",
  ...all the AA item fields you want to set...
}
```

- If a link `(canvasrealms, cr_item_42, item)` exists, the row is
  patched.
- Otherwise the row is created and the link is recorded.
- `ownerUserId` / `createdByUserId` is set automatically from the
  token user (admin → null, otherwise the user's id).

Response envelope:

```json
{ "kind": "item", "id": "<AA-uuid>", "externalId": "cr_item_42", "data": { ... } }
```

### Stale skip

```json
{ "skipped": "stale", "kind": "item", "id": "...", "externalId": "...", "data": { ... } }
```

Returned when `X-External-Updated-At` < AA's internal `updatedAt`. Your
side should treat this as a soft conflict — the AA row is newer.

---

## 4. Webhooks (push-on-save)

To get sub-30-second freshness on the partner side, register a webhook
endpoint:

```
POST /api/sync/v1/webhooks
{ "url": "https://canvasrealms.com/api/aa-webhook" }
```

Response (the `secret` is shown ONCE — store it):

```json
{ "id": "...", "url": "...", "secret": "<base64url-32-bytes>", "active": true }
```

### Delivery

When something changes in AA's library:

```
POST <your URL>
content-type: application/json
x-aa-event: library.item.updated
x-aa-signature: sha256=<hex hmac>
user-agent: ArcanaAdventure-Sync/1.0

{
  "event": "library.item.updated",
  "kind": "item",
  "action": "updated",
  "id": "<AA uuid>",
  "externalId": "cr_item_42",
  "userId": "<owner uuid or null>",
  "data": { ...full row... },
  "ts": "2026-05-13T10:00:00Z"
}
```

For UI-driven mutations (admin web UI) AA emits a lower-fidelity
`library.changed` event with just `{event, kind, action: "changed",
ts}` — re-pull the affected list when you receive it.

### Signature verification

```ts
import crypto from "node:crypto";
const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-aa-signature"]));
```

Or use the helper in `@arcana/aa-sync-sdk`:

```ts
import { verifyWebhookSignature } from "@arcana/aa-sync-sdk";
const ok = await verifyWebhookSignature(rawBody, secret, req.headers["x-aa-signature"]);
```

### Retry policy

Exponential backoff: 5s, 30s, 2m, 10m, 1h, 6h. After 6 failures the job
moves to the **dead** queue (visible in the AA admin Sync Status card,
which can re-queue them).

### Loop prevention

- Set `X-Sync-Origin: <your client_id>` on all your POST/PATCH/DELETE
  calls.
- AA suppresses webhook delivery to webhooks owned by that same client.

---

## 5. Connected Apps (end-user UI)

Users can see and revoke their authorizations at:

- `https://arcana.replit.app/account` (linked from the profile dropdown
  → "Connected Apps")

Revoking marks all of that user's tokens for that client as revoked
immediately.

---

## 6. Admin observability

Site admins see the **External Sync** card on the
`/admin` dashboard:

- Counters for pending / sending / succeeded / failed / dead jobs
- Recent 50 deliveries with status, event, attempts, last error
- "Retry Dead" button to requeue everything in the dead state

Powered by:

- `GET  /api/admin/sync-status`
- `POST /api/admin/sync-status/retry`

---

## 7. SDK

```bash
# packaged at packages/aa-sync-sdk in this repo
npm install @arcana/aa-sync-sdk   # publish path TBD
```

```ts
import { ArcanaSyncClient } from "@arcana/aa-sync-sdk";

const client = new ArcanaSyncClient({
  baseUrl: "https://arcana.replit.app",
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  clientId: "canvasrealms",
  clientSecret: process.env.CANVASREALMS_CLIENT_SECRET!,
  originId: "canvasrealms",
  onTokenRefresh: persist,
});

await client.upsert("item", {
  externalId: "cr_item_42",
  externalUpdatedAt: new Date().toISOString(),
  name: "Sunblade",
});
```

Auto-refreshes on 401, supports loop-prevention, signature
verification helpers, and PKCE helpers (`generatePkce`,
`hashChallenge`, `buildAuthorizeUrl`, `exchangeAuthorizationCode`).

---

## 8. Discoverability

- **OpenAPI 3.1 spec**: `GET /api/sync/v1/openapi.json`
- **Swagger UI**: `GET /api/sync/v1/docs`

---

## 9. Operational notes

- Schema lives in `shared/schema.ts` (tables prefixed `oauth_*`,
  `external_entity_links`, `outgoing_webhooks`,
  `outbound_webhook_jobs`).
- Worker tick is 5 seconds, per-call timeout 15 seconds.
- All access tokens are opaque random strings (no JWTs); revocation is
  immediate.
- The CanvasRealms OAuth client is seeded automatically on server
  start. To rotate the secret, set `CANVASREALMS_CLIENT_SECRET`,
  delete the row from `oauth_clients`, and restart — it will be
  reseeded with the new secret.

---

## 7. Drop-in dialogs (`@arcana/library-dialogs`)

Partner apps that want **the same create/edit dialogs Arcana ships with** —
items, spells, characters, classes, feats, etc. — can pull in the React
package `@arcana/library-dialogs` instead of rebuilding them. The dialogs
talk to the sync API (section 3) under the hood, so authentication and
data shape are identical to the rest of this contract.

### Add the package
```bash
npm add @arcana/library-dialogs @arcana/aa-sync-sdk
```
Then once at app entry:
```ts
import "@arcana/library-dialogs/theme.css";
```

### Mount
```tsx
import { ItemDialog, minimalHostAdapter } from "@arcana/library-dialogs";

const host = minimalHostAdapter({
  baseUrl: "https://your-arcana.example",
  accessToken: oauthBearerFromStep2,
});

<ItemDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />
```

### Theming
All visual tokens are CSS custom properties under `[data-ld-root]`.
Re-skin globally by overriding `--ld-bg`, `--ld-surface`, `--ld-accent`,
etc. on any ancestor — no theme prop drilling, no fork.

### Persistence
Each dialog bundles its nested children (rolls, craft recipes, template
links, embedded items/spells/hotbars/...) into a single
`POST /api/sync/v1/{kind}s` call. The server's children-aware
`applyChildren` writes the parent + children atomically — no new routes
needed beyond what's already documented in section 3.

### Coverage in v0.1.0
- `<ItemDialog>` (every item-type branch including AAv2 `crafter`)
- `<RollTemplateDialog>` (live admin templates with auto-fanout)
- Reusable nested editors: `<RollEntriesEditor>`, `<CraftRecipesEditor>`,
  `<ItemTemplateLinksPanel>`

Subsequent releases (0.2.0 → 0.5.0) add `<SpellDialog>`,
`<CharacterDialog>`, `<CharacterTemplateDialog>`, `<SpeciesDialog>`,
`<FeatTreeDialog>` (with `<FeatTreeCanvas>`), and `<ClassDialog>` (with
`<SkillTreeEditor>`). Every dialog uses the same HostAdapter and theme
contract, so partners that integrate today get every future dialog for
free on upgrade.

A runnable smoke test with a CanvasRealms-styled re-skin lives at
`examples/canvasrealms-mount/`.
