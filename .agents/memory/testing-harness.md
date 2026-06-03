---
name: Server API test harness
description: How to write vitest API tests against the monolithic registerRoutes without a real DB.
---

# Server API test harness (vitest)

Tests live in `server/__tests__/*.test.ts` and `shared/__tests__/*.test.ts`; config is `vitest.config.ts` (node env, `@shared`/`@` aliases). Run with `npm test` (registered as the `test` validation command).

`server/routes.ts` exposes only `registerRoutes(app)` — every handler is a closure inside it, so you cannot import a single handler. To test one route you must boot the whole thing with the heavy deps mocked.

**Rule:** mock `../storage`, `../db`, `../sync`, `../email`, `../googleDrive`, and `../lib/library-acl` via `vi.mock` (use `vi.hoisted` for mutable spy objects). Mock paths are resolved to the same absolute file as routes' `./storage` imports, so `../storage` from `server/__tests__` matches. Keep the `library-acl` mock complete — it exports `isAdminUser`, `getLibraryScope`, `enforceLibraryWrite/Read`, `canReadLibraryRow`, `canWriteLibraryRow`, `requireLibraryAaV2`; a missing export makes `registerRoutes` throw at boot.

**Why a real DB is avoided:** route handlers only touch the DB through `storage`; the only direct `db` use at boot is a startup migration, satisfied by a tiny chainable Promise-proxy stub.

**Auth without express-session:** register a middleware whose function name is literally `session` that sets `req.session = { userId: req.headers['x-test-user'] }`. The WS-upgrade path in `registerRoutes` finds the session middleware *by layer name* (`layer.name === 'session'`), so the same header authenticates both HTTP (via `fetch`) and WebSocket connections.

**Capturing WS broadcasts:** some handlers (e.g. V3 spell author) return an UNcensored HTTP body but broadcast a CENSORED payload via `broadcastToCampaign`. To assert the broadcast, listen with the real `ws` client: connect with `x-test-user` header, send `{type:'join_campaign', campaignId}`, wait for `joined_campaign`, then trigger the route and wait for the broadcast event. A user whose id equals `campaign.gmUserId` joins as GM without a membership row.
