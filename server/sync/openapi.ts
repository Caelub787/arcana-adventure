// OpenAPI 3.1 spec for the sync API. Schemas are derived from the Zod
// insert schemas in shared/schema.ts via @asteasolutions/zod-to-openapi
// so payloads stay in lockstep with the database. Paths are assembled
// procedurally per entity-kind.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import {
  insertItemSchema,
  insertSystemSpellSchema,
  insertCharacterSchema,
  insertSystemSpeciesSchema,
  insertClassSchema,
  insertFeatTreeSchema,
  insertRollEntrySchema,
  insertHotbarSchema,
  insertCharacterCustomSkillSchema,
  insertCharacterTraitSchema,
  insertCharacterFeatSchema,
  insertCharacterClassSchema,
  insertCharacterClassSkillSchema,
  insertClassSkillNodeSchema,
  insertClassSkillConnectionSchema,
  insertFeatSchema,
  insertFeatConnectionSchema,
  insertSpellSchema,
  insertV3ElementRequirementSchema,
} from "@shared/schema";

extendZodWithOpenApi(z);

const KIND_PLURAL: Record<string, string> = {
  "item": "items", "spell": "spells", "character": "characters", "species": "species",
  "class": "classes", "feat-tree": "feat-trees",
  "character-template": "character-templates", "roll-template": "roll-templates",
  "element": "elements",
};

// Map each sync kind to the Zod insert schema that backs it. Roll templates
// reuse the item schema (they're items with isLiveTemplate=true), and
// character-template reuses the character schema (isTemplate=true).
const KIND_ZOD: Record<string, z.ZodTypeAny> = {
  "item": insertItemSchema,
  "spell": insertSystemSpellSchema,
  "character": insertCharacterSchema,
  "species": insertSystemSpeciesSchema,
  "class": insertClassSchema,
  "feat-tree": insertFeatTreeSchema,
  "character-template": insertCharacterSchema,
  "roll-template": insertItemSchema,
  "element": insertV3ElementRequirementSchema,
};

const KINDS = Object.keys(KIND_PLURAL);

function toComponentName(kind: string): string {
  // "feat-tree" -> "Sync_FeatTree"; "character-template" -> "Sync_CharacterTemplate"
  const camel = kind.split("-").map(s => s[0].toUpperCase() + s.slice(1)).join("");
  return `Sync${camel}`;
}

function buildSpec() {
  const registry = new OpenAPIRegistry();

  // Register every kind's payload schema (full + partial-for-PATCH) so $refs resolve.
  // Some insert schemas wrap a ZodObject in .refine() (ZodEffects), which lacks
  // .partial(); unwrap to the inner ZodObject when needed.
  // We also extend each insert schema with the sync meta fields
  // (`externalId` + `externalUpdatedAt`) so the published contract matches
  // the upsert / stale-skip behavior in server/sync/api.ts.
  const unwrapToObject = (s: any): z.ZodObject<any> => {
    let cur = s;
    while (cur && typeof cur.partial !== "function" && cur._def?.schema) cur = cur._def.schema;
    return cur as z.ZodObject<any>;
  };
  const syncMeta = {
    externalId: z.string().optional().openapi({
      description: "Partner-side stable id. When present on POST, the request becomes an upsert keyed on (clientId, kind, externalId) via external_entity_links.",
    }),
    externalUpdatedAt: z.string().datetime().optional().openapi({
      description: "ISO timestamp of the source-of-truth row. If older than the server's current updatedAt the write is skipped (stale-skip). May also be sent via the X-External-Updated-At header.",
    }),
  };
  // ---- Child sub-schemas (rolls, embedded items/spells, feats, classes,
  // skill nodes & connections, etc.) so the partner-side schema-driven UI
  // can render the FULL entity dialog, not just the parent's flat columns.
  const childOptId = { id: z.string().optional() };
  const rollSchema = registry.register(
    "SyncRollEntry",
    unwrapToObject(insertRollEntrySchema as any).extend(childOptId).openapi("SyncRollEntry", {
      description: "Roll entry attached to an item, spell, or roll-template (polymorphic via ownerType+ownerId; server fills both).",
    }),
  );
  const embeddedItemSchema = registry.register(
    "SyncEmbeddedItem",
    unwrapToObject(insertItemSchema as any).extend({
      ...childOptId,
      rolls: z.array(rollSchema).optional().openapi({ description: "Rolls attached to this item." }),
    }).openapi("SyncEmbeddedItem", { description: "Item embedded in a character's inventory; carries its own rolls." }),
  );
  const embeddedSpellSchema = registry.register(
    "SyncEmbeddedSpell",
    unwrapToObject(insertSpellSchema as any).extend({
      ...childOptId,
      rolls: z.array(rollSchema).optional().openapi({ description: "Rolls attached to this spell." }),
    }).openapi("SyncEmbeddedSpell", { description: "Spell embedded in a character's spellbook; carries its own rolls." }),
  );
  const hotbarSchema = registry.register(
    "SyncHotbar",
    unwrapToObject(insertHotbarSchema as any).extend(childOptId).openapi("SyncHotbar"),
  );
  const customSkillSchema = registry.register(
    "SyncCharacterCustomSkill",
    unwrapToObject(insertCharacterCustomSkillSchema as any).extend(childOptId).openapi("SyncCharacterCustomSkill"),
  );
  const traitSchema = registry.register(
    "SyncCharacterTrait",
    unwrapToObject(insertCharacterTraitSchema as any).extend(childOptId).openapi("SyncCharacterTrait"),
  );
  const charFeatSchema = registry.register(
    "SyncCharacterFeat",
    unwrapToObject(insertCharacterFeatSchema as any).extend(childOptId).openapi("SyncCharacterFeat"),
  );
  const charClassSchema = registry.register(
    "SyncCharacterClass",
    unwrapToObject(insertCharacterClassSchema as any).extend(childOptId).openapi("SyncCharacterClass"),
  );
  const charClassSkillSchema = registry.register(
    "SyncCharacterClassSkill",
    unwrapToObject(insertCharacterClassSkillSchema as any).extend(childOptId).openapi("SyncCharacterClassSkill"),
  );
  const classNodeSchema = registry.register(
    "SyncClassSkillNode",
    unwrapToObject(insertClassSkillNodeSchema as any).extend(childOptId).openapi("SyncClassSkillNode"),
  );
  const classConnSchema = registry.register(
    "SyncClassSkillConnection",
    unwrapToObject(insertClassSkillConnectionSchema as any).extend(childOptId).openapi("SyncClassSkillConnection", {
      description: "Connection between two skill nodes. fromNodeId/toNodeId may use the partner-side ids on first upload — the server remaps them to the freshly-inserted node ids.",
    }),
  );
  const featSchema = registry.register(
    "SyncFeat",
    unwrapToObject(insertFeatSchema as any).extend(childOptId).openapi("SyncFeat"),
  );
  const featConnSchema = registry.register(
    "SyncFeatConnection",
    unwrapToObject(insertFeatConnectionSchema as any).extend(childOptId).openapi("SyncFeatConnection", {
      description: "Connection between two feats. fromFeatId/toFeatId may use the partner-side ids on first upload — the server remaps them to the freshly-inserted feat ids.",
    }),
  );

  // Per-kind nested children (sent on POST/PATCH; returned on GET).
  // Sending a child-array key replaces the existing children for that kind
  // atomically; omitting the key leaves them untouched.
  const childrenByKind: Record<string, Record<string, z.ZodTypeAny>> = {
    "item": { rolls: z.array(rollSchema).optional() },
    "spell": { rolls: z.array(rollSchema).optional() },
    "roll-template": { rolls: z.array(rollSchema).optional() },
    "character": {
      items: z.array(embeddedItemSchema).optional(),
      spells: z.array(embeddedSpellSchema).optional(),
      hotbars: z.array(hotbarSchema).optional(),
      customSkills: z.array(customSkillSchema).optional(),
      traits: z.array(traitSchema).optional(),
      feats: z.array(charFeatSchema).optional(),
      classes: z.array(charClassSchema).optional(),
      classSkills: z.array(charClassSkillSchema).optional(),
    },
    "character-template": {
      items: z.array(embeddedItemSchema).optional(),
      spells: z.array(embeddedSpellSchema).optional(),
      hotbars: z.array(hotbarSchema).optional(),
      customSkills: z.array(customSkillSchema).optional(),
      traits: z.array(traitSchema).optional(),
      feats: z.array(charFeatSchema).optional(),
      classes: z.array(charClassSchema).optional(),
      classSkills: z.array(charClassSkillSchema).optional(),
    },
    "class": {
      skillNodes: z.array(classNodeSchema).optional(),
      skillConnections: z.array(classConnSchema).optional(),
    },
    "feat-tree": {
      feats: z.array(featSchema).optional(),
      connections: z.array(featConnSchema).optional(),
    },
    "species": {},
    "element": {},
  };

  const refByKind: Record<string, any> = {};
  const partialRefByKind: Record<string, any> = {};
  for (const kind of KINDS) {
    const compName = toComponentName(kind);
    const base = KIND_ZOD[kind] as any;
    const inner = unwrapToObject(base);
    const childExt = childrenByKind[kind] || {};
    const fullWithMeta = inner.extend({ ...syncMeta, ...childExt });
    refByKind[kind] = registry.register(
      compName,
      fullWithMeta.openapi(compName, {
        description: `Sync upsert payload for ${kind}. Derived from insert${compName.replace(/^Sync/, "")}Schema + sync meta fields (externalId, externalUpdatedAt) + nested children. Sending a children array (e.g. rolls) replaces the existing children atomically; omit it to leave them untouched.`,
      }),
    );
    partialRefByKind[kind] = registry.register(
      `${compName}Patch`,
      inner.partial().extend({ externalUpdatedAt: syncMeta.externalUpdatedAt, ...childExt }).openapi(`${compName}Patch`, {
        description: `Partial PATCH payload for ${kind} (all fields optional). Send externalUpdatedAt for stale-skip semantics. Children arrays follow the same replace-on-send semantics as POST.`,
      }),
    );
  }

  // Envelope returned by all sync endpoints.
  const envelopeSchema = registry.register(
    "SyncEnvelope",
    z.object({
      kind: z.string().openapi({ example: "item" }),
      id: z.string().openapi({ example: "uuid" }),
      externalId: z.string().nullable().openapi({ example: "cr_item_42" }),
      data: z.unknown(),
    }).openapi("SyncEnvelope"),
  );

  registry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http", scheme: "bearer", bearerFormat: "Opaque",
  });

  // /api/sync/v1/me
  registry.registerPath({
    method: "get", path: "/api/sync/v1/me", tags: ["OAuth"],
    summary: "Resolve the bearer user (id, isAdmin, scopes, library routing)",
    security: [{ BearerAuth: [] }],
    responses: { 200: { description: "OK", content: { "application/json": {
      schema: z.object({
        id: z.string(), isAdmin: z.boolean(), scopes: z.array(z.string()),
        libraryRouting: z.enum(["global-admin", "personal-aa-v2"]),
      }),
    } } } },
  });

  for (const kind of KINDS) {
    const tagName = toComponentName(kind).replace(/^Sync/, "");
    const base = `/api/sync/v1/${KIND_PLURAL[kind]}`;
    const refSchema = refByKind[kind];

    registry.registerPath({
      method: "get", path: base, tags: [tagName],
      summary: `List ${kind}s visible to the bearer user`,
      security: [{ BearerAuth: ["library:read"] }],
      responses: { 200: { description: "OK", content: { "application/json": {
        schema: z.object({ data: z.array(refSchema) }),
      } } } },
    });
    registry.registerPath({
      method: "get", path: `${base}/{id}`, tags: [tagName],
      summary: `Get ${kind} by Arcana internal id`,
      security: [{ BearerAuth: ["library:read"] }],
      request: { params: z.object({ id: z.string() }) },
      responses: { 200: { description: "OK", content: { "application/json": { schema: envelopeSchema } } }, 404: { description: "not_found" } },
    });
    registry.registerPath({
      method: "get", path: `${base}/by-external/{externalId}`, tags: [tagName],
      summary: `Get ${kind} by external (partner) id`,
      security: [{ BearerAuth: ["library:read"] }],
      request: { params: z.object({ externalId: z.string() }) },
      responses: { 200: { description: "OK", content: { "application/json": { schema: envelopeSchema } } }, 404: { description: "not_found" } },
    });
    registry.registerPath({
      method: "post", path: base, tags: [tagName],
      summary: `Upsert (create-or-update by externalId) a ${kind}`,
      description: "Idempotent on externalId via external_entity_links. Send X-Sync-Origin: <client_id> to suppress webhook fanout to your own webhook. Send X-External-Updated-At: <ISO> to enable stale-skip semantics.",
      security: [{ BearerAuth: ["library:write"] }],
      request: { body: { content: { "application/json": { schema: refSchema } } } },
      responses: { 200: { description: "Updated or stale-skipped", content: { "application/json": { schema: envelopeSchema } } }, 201: { description: "Created", content: { "application/json": { schema: envelopeSchema } } } },
    });
    registry.registerPath({
      method: "patch", path: `${base}/{id}`, tags: [tagName],
      summary: `Patch ${kind} by Arcana internal id`,
      security: [{ BearerAuth: ["library:write"] }],
      request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: partialRefByKind[kind] } } } },
      responses: { 200: { description: "OK", content: { "application/json": { schema: envelopeSchema } } }, 404: { description: "not_found" } },
    });
    registry.registerPath({
      method: "delete", path: `${base}/{id}`, tags: [tagName],
      summary: `Delete ${kind}`,
      security: [{ BearerAuth: ["library:write"] }],
      request: { params: z.object({ id: z.string() }) },
      responses: { 200: { description: "OK" } },
    });
  }

  // Webhooks
  registry.registerPath({
    method: "get", path: "/api/sync/v1/webhooks", tags: ["Webhooks"],
    summary: "List webhooks registered by the calling OAuth client",
    security: [{ BearerAuth: ["webhooks:manage"] }],
    responses: { 200: { description: "OK" } },
  });
  registry.registerPath({
    method: "post", path: "/api/sync/v1/webhooks", tags: ["Webhooks"],
    summary: "Register a new outbound webhook (https only in prod, no private hosts)",
    security: [{ BearerAuth: ["webhooks:manage"] }],
    request: { body: { content: { "application/json": { schema: z.object({ url: z.string().url() }) } } } },
    responses: { 201: { description: "Created. Secret is returned ONCE." } },
  });
  registry.registerPath({
    method: "delete", path: "/api/sync/v1/webhooks/{id}", tags: ["Webhooks"],
    summary: "Delete a registered webhook",
    security: [{ BearerAuth: ["webhooks:manage"] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "OK" } },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Arcana Adventure Sync API",
      version: "1.0.0",
      description: "Two-way library sync for partner apps (CanvasRealms etc.). All endpoints under /api/sync/v1 require an OAuth 2.0 bearer access token. Schemas are derived from the project Zod insert schemas.",
    },
    servers: [{ url: "https://arcana.replit.app" }, { url: "http://localhost:5000" }],
  });
}

let cached: any = null;
export function registerOpenApiRoutes(app: Express) {
  app.get("/api/sync/v1/openapi.json", (_req: Request, res: Response) => {
    try {
      if (!cached) cached = buildSpec();
      res.json(cached);
    } catch (err: any) {
      res.status(500).json({ error: "openapi_build_failed", message: err?.message });
    }
  });

  app.get("/api/sync/v1/docs", (_req: Request, res: Response) => {
    res.type("html").send(`<!doctype html><html><head><title>Arcana Sync API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=()=>SwaggerUIBundle({url:"/api/sync/v1/openapi.json",dom_id:"#swagger-ui"});</script>
</body></html>`);
  });
}
