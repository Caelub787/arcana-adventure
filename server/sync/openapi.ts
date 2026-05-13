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
} from "@shared/schema";

extendZodWithOpenApi(z);

const KIND_PLURAL: Record<string, string> = {
  "item": "items", "spell": "spells", "character": "characters", "species": "species",
  "class": "classes", "feat-tree": "feat-trees",
  "character-template": "character-templates", "roll-template": "roll-templates",
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
  const unwrapToObject = (s: any): z.ZodObject<any> => {
    let cur = s;
    while (cur && typeof cur.partial !== "function" && cur._def?.schema) cur = cur._def.schema;
    return cur as z.ZodObject<any>;
  };
  const refByKind: Record<string, any> = {};
  const partialRefByKind: Record<string, any> = {};
  for (const kind of KINDS) {
    const compName = toComponentName(kind);
    const base = KIND_ZOD[kind] as any;
    refByKind[kind] = registry.register(
      compName,
      base.openapi(compName, {
        description: `Sync payload for ${kind}. Derived from insert${compName.replace(/^Sync/, "")}Schema in shared/schema.ts.`,
      }),
    );
    const inner = unwrapToObject(base);
    partialRefByKind[kind] = registry.register(
      `${compName}Patch`,
      inner.partial().openapi(`${compName}Patch`, {
        description: `Partial PATCH payload for ${kind} (all fields optional).`,
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
