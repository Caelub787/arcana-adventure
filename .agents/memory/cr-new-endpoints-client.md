---
name: CR new endpoints — client calling & node access model
description: How to wire brand-new Canvas Realms backend endpoints into the React client, and the per-node privacy/grant access model.
---

# Calling new CR endpoints from the client

The CR React client is an Orval-generated Tanstack Query client
(`client/src/canvasrealms/_pkg/api-client-react`), generated from the
OpenAPI/api-zod contract — so a brand-new server route does NOT get a hook
until the contract + codegen are updated.

**To use a new CR endpoint without regenerating:** import `customFetch` from
`@workspace/api-client-react` and call it directly with the FULL path including
the `/api` prefix (e.g. `customFetch('/api/nodes/<id>/my-access', { responseType: 'json' })`).
The generated URL builders hardcode `/api/...` and no `baseUrl` is set on web,
so relative `/api/...` paths are correct. `customFetch` already sends cookies
(`credentials:'include'`) and parses JSON; for 204 responses use
`responseType:'text'`. Wrap reads in `useQuery`, writes in `useMutation`, and
invalidate ad-hoc keys plus the generated `getListNodesQueryKey` /
`getListRealmsQueryKey`.

**Why:** adding the field/route to the api-zod contract + running codegen is the
"proper" path, but for a focused feature the direct `customFetch` call is far
cheaper and avoids touching the whole generated surface.

**Gotcha — response schemas strip unknown keys:** the contract's response
schemas call `.parse()`, which DROPS any field not in the schema. So adding a
new *field* to an existing model (e.g. a node's privacy flag) still requires
updating every relevant response zod schema, or the field vanishes from
responses even though the server sends it.

# Per-node privacy & edit-grant access model

- A per-node "private" flag hides a node from realm *viewers*. Owners/editors
  always see everything. A viewer sees a private node only with an explicit
  per-node grant.
- A node-edit-grant (nodeId+userId) lets a specific viewer EDIT specific nodes.
  Server enforces via a `requireNodeWriteAccess` middleware: editor+ pass;
  viewer passes only with a grant, and a granted viewer's PATCH is stripped of
  privacy/realm-move fields — granted viewers edit content only.
- A realm's `linkedCampaignId` bridges every campaign member to realm "viewer"
  in `resolveRealmRole`; the realm list also surfaces realms whose
  linked campaign ∈ the user's campaigns.
- **Grant candidates** = campaign players of `linkedCampaignId ?? realmId` (the
  auto-embed realm's own id doubles as its campaign id) + accepted viewer CR
  collaborators. GMs/editors are excluded (already have write access).
- All read routes (list/get/recent/summary/tag-counts) filter private nodes for
  viewers; aggregations recompute in JS for viewers to respect grants instead
  of SQL grouping.

# Migrations convention (whole repo, not just CR)

Schema lives in `shared/schema.ts` + `shared/cr-schema.ts`; dev uses
`drizzle-kit push`. The team ALSO hand-writes idempotent SQL files in
`migrations/` (e.g. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, guarded FK adds).
`drizzle-kit generate` is effectively broken here (meta/ snapshots are stale and
collide), and the `_journal.json` is NOT kept in sync with the newest hand-written
files. So: after any schema change, add a hand-written idempotent `.sql` migration
matching the push state — do NOT rely on generate, and don't worry about the
journal/meta snapshots. **Why:** code review rejects schema changes that ship
without a migration file.
