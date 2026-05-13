# @arcana/aa-sync-sdk

Lightweight TypeScript client for Arcana Adventure's two-way library
sync. Pure fetch, no dependencies. Works in Node 18+, Deno, and modern
browsers.

See **/INTEGRATION.md** at the repo root for the full integration guide.

## Quick start

```ts
import { ArcanaSyncClient, verifyWebhookSignature } from "@arcana/aa-sync-sdk";

const client = new ArcanaSyncClient({
  baseUrl: "https://arcana.replit.app",
  accessToken: "<bearer>",
  refreshToken: "<refresh>",
  clientId: "canvasrealms",
  clientSecret: process.env.CANVASREALMS_CLIENT_SECRET!,
  originId: "canvasrealms",
});

await client.upsert("item", {
  externalId: "cr_item_42",
  externalUpdatedAt: "2026-05-13T10:00:00Z",
  name: "Sunblade",
  itemType: "weapon",
});

await client.registerWebhook("https://canvasrealms.com/api/aa-webhook");
```

## Webhook receiver

```ts
app.post("/api/aa-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const ok = await verifyWebhookSignature(
    req.body.toString("utf8"),
    process.env.AA_WEBHOOK_SECRET!,
    req.headers["x-aa-signature"] as string,
  );
  if (!ok) return res.status(401).end();
  const event = JSON.parse(req.body.toString("utf8"));
  // event = { event, kind, action, id?, externalId?, data?, ts }
  res.json({ ok: true });
});
```
