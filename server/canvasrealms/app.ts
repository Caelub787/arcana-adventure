/**
 * The standalone Canvas Realms Express app is no longer used in the host.
 * The host mounts the CR routers directly via `registerCanvasRealmsRoutes`
 * (see ./index.ts). This module is intentionally left as a no-op shim so that
 * any lingering import does not pull in Clerk / pino / cors.
 */
export {};
