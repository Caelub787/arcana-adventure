import type { Express, Request, Response } from "express";

const KIND_PLURAL: Record<string, string> = {
  "item": "items", "spell": "spells", "character": "characters", "species": "species",
  "class": "classes", "feat-tree": "feat-trees",
  "character-template": "character-templates", "roll-template": "roll-templates",
};
const KINDS = Object.keys(KIND_PLURAL);

function buildSpec() {
  const paths: any = {};

  // /api/sync/v1/me
  paths["/api/sync/v1/me"] = {
    get: {
      summary: "Get authenticated sync user info",
      security: [{ BearerAuth: [] }],
      responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, isAdmin: { type: "boolean" }, scopes: { type: "array", items: { type: "string" } }, libraryRouting: { type: "string", enum: ["global-admin", "personal-aa-v2"] } } } } } } },
    },
  };

  for (const kind of KINDS) {
    const tag = kind.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
    const base = `/api/sync/v1/${KIND_PLURAL[kind]}`;
    const refSchema = `Sync${tag}`;

    paths[base] = {
      get: {
        tags: [tag], summary: `List ${kind}s`, security: [{ BearerAuth: ["library:read"] }],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: `#/components/schemas/${refSchema}` } } } } } } } },
      },
      post: {
        tags: [tag], summary: `Create or upsert a ${kind}`, security: [{ BearerAuth: ["library:write"] }],
        parameters: [
          { in: "header", name: "X-Sync-Origin", required: false, schema: { type: "string" }, description: "Client identifier (e.g. canvasrealms) — suppresses outbound webhook fanout to this same client." },
          { in: "header", name: "X-External-Updated-At", required: false, schema: { type: "string", format: "date-time" }, description: "ISO timestamp of the source-of-truth update; older-than-internal triggers a stale-skip." },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { allOf: [{ $ref: `#/components/schemas/${refSchema}` }, { type: "object", properties: { externalId: { type: "string", description: "External ID for upsert keying." }, externalUpdatedAt: { type: "string", format: "date-time" } } }] } } } },
        responses: { "200": { description: "Updated or stale-skipped", content: { "application/json": { schema: { type: "object" } } } }, "201": { description: "Created", content: { "application/json": { schema: { type: "object" } } } } },
      },
    };

    paths[`${base}/{id}`] = {
      get: { tags: [tag], summary: `Get ${kind} by internal id`, security: [{ BearerAuth: ["library:read"] }], parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
      patch: { tags: [tag], summary: `Update ${kind}`, security: [{ BearerAuth: ["library:write"] }], parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }, { in: "header", name: "X-Sync-Origin", schema: { type: "string" } }, { in: "header", name: "X-External-Updated-At", schema: { type: "string", format: "date-time" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${refSchema}` } } } }, responses: { "200": { description: "OK" } } },
      delete: { tags: [tag], summary: `Delete ${kind}`, security: [{ BearerAuth: ["library:write"] }], parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
    };
    paths[`${base}/by-external/{externalId}`] = {
      get: { tags: [tag], summary: `Get ${kind} by external id`, security: [{ BearerAuth: ["library:read"] }], parameters: [{ in: "path", name: "externalId", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
    };
  }

  // Webhook management
  paths["/api/sync/v1/webhooks"] = {
    get: { tags: ["Webhooks"], summary: "List webhooks for this client", security: [{ BearerAuth: ["webhooks:manage"] }], responses: { "200": { description: "OK" } } },
    post: { tags: ["Webhooks"], summary: "Register a webhook", security: [{ BearerAuth: ["webhooks:manage"] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] } } } }, responses: { "201": { description: "Created (returns secret once)" } } },
  };
  paths["/api/sync/v1/webhooks/{id}"] = {
    delete: { tags: ["Webhooks"], summary: "Delete a webhook", security: [{ BearerAuth: ["webhooks:manage"] }], parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
  };

  // OAuth
  paths["/oauth/authorize"] = { get: { tags: ["OAuth"], summary: "Authorization endpoint (renders consent page)", parameters: [
    { in: "query", name: "response_type", required: true, schema: { type: "string", enum: ["code"] } },
    { in: "query", name: "client_id", required: true, schema: { type: "string" } },
    { in: "query", name: "redirect_uri", required: true, schema: { type: "string" } },
    { in: "query", name: "scope", required: false, schema: { type: "string" } },
    { in: "query", name: "state", required: false, schema: { type: "string" } },
    { in: "query", name: "code_challenge", required: false, schema: { type: "string" } },
    { in: "query", name: "code_challenge_method", required: false, schema: { type: "string", enum: ["S256", "plain"] } },
  ], responses: { "200": { description: "Consent HTML" }, "302": { description: "Redirect after decision" } } } };
  paths["/oauth/token"] = { post: { tags: ["OAuth"], summary: "Token endpoint", requestBody: { required: true, content: { "application/x-www-form-urlencoded": { schema: { type: "object", properties: { grant_type: { type: "string", enum: ["authorization_code", "refresh_token"] }, code: { type: "string" }, refresh_token: { type: "string" }, redirect_uri: { type: "string" }, client_id: { type: "string" }, client_secret: { type: "string" }, code_verifier: { type: "string" } } } } } }, responses: { "200": { description: "Token response" } } } };
  paths["/oauth/revoke"] = { post: { tags: ["OAuth"], summary: "Revoke a token", responses: { "200": { description: "OK" } } } };
  paths["/oauth/userinfo"] = { get: { tags: ["OAuth"], summary: "User info (bearer)", security: [{ BearerAuth: [] }], responses: { "200": { description: "OK" } } } };

  // Permissive entity schemas: the AA storage layer accepts the existing
  // insert shapes; rather than re-encode every Drizzle Zod schema here,
  // expose a generic object with the documented well-known fields and
  // declare additionalProperties:true so consumers know extras are kept.
  const genericEntity = (extra: Record<string, any> = {}): any => ({
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string", description: "Internal AA id (returned)" },
      name: { type: "string" },
      system: { type: "string", description: "For non-admin syncs this is forced to 'aa-v2'." },
      ownerUserId: { type: "string", nullable: true, description: "Set by server based on the token user (admin → null)." },
      createdByUserId: { type: "string", nullable: true, description: "Items use this column instead of ownerUserId." },
      updatedAt: { type: "string", format: "date-time" },
      ...extra,
    },
  });

  const schemas: any = {
    SyncItem: genericEntity({ itemType: { type: "string" }, isLiveTemplate: { type: "boolean" } }),
    SyncSpell: genericEntity({ spellType: { type: "string" }, manaCost: { type: "integer" } }),
    SyncCharacter: genericEntity({ isTemplate: { type: "boolean" } }),
    SyncSpecies: genericEntity(),
    SyncClass: genericEntity(),
    SyncFeatTree: genericEntity(),
    SyncCharacterTemplate: genericEntity({ isTemplate: { type: "boolean" } }),
    SyncRollTemplate: genericEntity({ isLiveTemplate: { type: "boolean" } }),
  };

  return {
    openapi: "3.1.0",
    info: { title: "Arcana Adventure Sync API", version: "1.0.0", description: "Two-way library sync for partner apps (CanvasRealms etc.). All endpoints under /api/sync/v1 require an OAuth 2.0 bearer access token." },
    servers: [{ url: "https://arcana.replit.app" }, { url: "http://localhost:5000" }],
    components: {
      securitySchemes: { BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Opaque" } },
      schemas,
    },
    tags: [
      { name: "Item" }, { name: "Spell" }, { name: "Character" }, { name: "Species" },
      { name: "Class" }, { name: "FeatTree" }, { name: "CharacterTemplate" },
      { name: "RollTemplate" }, { name: "Webhooks" }, { name: "OAuth" },
    ],
    paths,
  };
}

let cached: any = null;
export function registerOpenApiRoutes(app: Express) {
  app.get("/api/sync/v1/openapi.json", (_req: Request, res: Response) => {
    if (!cached) cached = buildSpec();
    res.json(cached);
  });
  // Tiny Swagger UI shell (CDN, no extra deps)
  app.get("/api/sync/v1/docs", (_req: Request, res: Response) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html><head><title>Arcana Sync API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head><body style="margin:0"><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/api/sync/v1/openapi.json',dom_id:'#ui'});</script>
</body></html>`);
  });
}
