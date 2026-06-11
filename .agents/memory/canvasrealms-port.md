---
name: Canvas Realms port into host World Builder
description: Non-obvious integration constraints from porting the standalone Canvas Realms (Yjs/Clerk monorepo) into this host Express+Vite app.
---

# WebSocket coexistence (host /ws + CR /api/realtime)
A path-bound `new WebSocketServer({server, path})` attaches an httpServer
`upgrade` listener that calls `abortHandshake(socket,400)` for ANY non-matching
path (ws lib). So you cannot just add a second path-bound ws server — it would
kill the other's upgrades. Vite dev HMR ALSO shares the same httpServer
(`hmr:{server}` in index-dev.ts) via its own *polite* upgrade listener that only
handles the `vite-hmr` subprotocol.
**Rule:** make the host ws `noServer:true` and add ONE *polite* `httpServer.on('upgrade')`
dispatcher: route `/api/realtime/*`→CR, `/ws`→`wss.handleUpgrade(...emit('connection'))`,
and for anything else DO NOTHING (never `socket.destroy()` — that breaks HMR).
**Why:** multiple upgrade listeners all fire; destroying unknown sockets kills Vite HMR.

# Copied monorepo packages carry poison tsconfig.json
The CR `_pkg/*` packages (api-zod, api-client-react) shipped their own
`tsconfig.json` with `extends "../../tsconfig.base.json"` (a monorepo base that
was NOT copied). esbuild/vite auto-discover the *nearest* tsconfig when
transforming a file and crash on the missing extends ("Cannot find module
../../tsconfig.base.json"). **Fix:** delete those per-package tsconfig.json so the
host root tsconfig is used. Watch for this with any future copied package.

# vitest needs aliases mirrored
vitest.config.ts has its OWN `resolve.alias` and does NOT read tsconfig `paths`.
Any alias added to tsconfig/vite for the port (`@cr`, `@workspace/db`,
`@workspace/api-*`, `@arcana/*`) must also be added to vitest.config.ts or host
server tests that transitively import the CR mount fail to load.

# @arcana/aa-sync-sdk is a deliberate stub
External "sync to an Arcana VTT instance" is OUT OF SCOPE and the SDK source was
not in the CR artifacts. `packages/aa-sync-sdk/index.ts` is a degraded stub:
types `SyncKind`/`SyncEnvelope` mirror `@arcana/library-dialogs/types`; runtime
fns throw `ArcanaSyncError` ("disabled"). Unreachable normally (only hit once a
realm stores Arcana OAuth creds, which never happens). Aliased in tsconfig+vite+vitest.

# Shared /api namespace: mount CR routes LAST
The CR combined router (`server/canvasrealms/routes/index.ts`) applies
`router.use(requireAuth)` with NO path filter, then is mounted at `/api`. If it
is registered BEFORE the host's PUBLIC auth routes (`/api/register`,
`/api/login`, `/api/forgot-password`, share links, etc.), CR's requireAuth
401s every unauthenticated host `/api/*` request before the host handler runs
(register itself never returns 401 — a 401 there is the tell-tale symptom).
**Rule:** mount `registerCanvasRealmsRoutes(app)` at the VERY END of
`registerRoutes` (just before `return httpServer`). CR owns distinct paths
(/api/realms, /api/nodes, ...) the host never defines, so host-first ordering is
conflict-free. The realtime/WS init can stay early (it only needs httpServer +
sessionMiddleware), only the HTTP route mount must move.

# Host mount of the CR app (standalone /worldbuilder)
CR `MainLayout` self-drives routing via `useRoute("/app/realm/:realmId")` and
syncs the URL, so the host registers `/app`, `/app/realm/:realmId`,
`/app/realm/:realmId/node/:nodeId` routes that all render the same page
(`client/src/pages/CanvasRealmsApp.tsx`); `/worldbuilder` just redirects to
`/app`. The page must wrap MainLayout in `ThemeProvider` (@cr/lib/theme) AND
`AppProvider` (@cr/lib/store) and mount sonner's `<Toaster/>` (host only mounts
the shadcn toaster; CR toasts use sonner). Missing ThemeProvider →
"useTheme must be used inside <ThemeProvider>" fatal screen. Host QueryClient is
shared (CR api-client-react uses @tanstack/react-query). Verified e2e: signup →
/app renders shell → create realm → create node → persists across reload.
