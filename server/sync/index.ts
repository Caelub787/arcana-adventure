import type { Express } from "express";
import { registerOAuthRoutes, seedCanvasRealmsClient } from "./oauth";
import { registerSyncRoutes } from "./api";
import { registerOpenApiRoutes } from "./openapi";
import { startWebhookWorker, emitLibraryChange, getRecentJobsSummary, retryFailedJobs } from "./webhooks";

export { emitLibraryChange, getRecentJobsSummary, retryFailedJobs };

export async function registerSync(app: Express) {
  registerOAuthRoutes(app);
  registerSyncRoutes(app);
  registerOpenApiRoutes(app);
  startWebhookWorker();
  await seedCanvasRealmsClient();
  console.log("[sync] mounted /oauth/* and /api/sync/v1/*");
}
