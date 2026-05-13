/**
 * @arcana/aa-sync-sdk
 *
 * Lightweight TypeScript client for Arcana Adventure's two-way library
 * sync. Drop into CanvasRealms (or any partner app) — pure fetch, no
 * dependencies.
 *
 * ```ts
 * import { ArcanaSyncClient, verifyWebhookSignature } from "@arcana/aa-sync-sdk";
 *
 * const client = new ArcanaSyncClient({
 *   baseUrl: "https://arcana.replit.app",
 *   accessToken: "<bearer>",
 *   refreshToken: "<refresh>",
 *   clientId: "canvasrealms",
 *   clientSecret: process.env.CANVASREALMS_CLIENT_SECRET!,
 *   originId: "canvasrealms", // suppresses webhook fanout to ourselves
 * });
 *
 * await client.upsert("item", { externalId: "cr_abc", name: "Sunblade", ... });
 * await client.list("spell");
 * ```
 */
export type SyncKind = "item" | "spell" | "character" | "species" | "class" | "feat-tree" | "character-template" | "roll-template";
/**
 * One-line factory: `const client = createClient({ baseUrl, accessToken });`
 * For full OAuth refresh support, pass `clientId`, `clientSecret`, and `refreshToken`.
 */
export declare function createClient(opts: ArcanaSyncClientOptions): ArcanaSyncClient;
export interface SyncEnvelope<T = any> {
    kind: SyncKind;
    id: string;
    externalId: string | null;
    data: T;
}
export interface ArcanaSyncClientOptions {
    baseUrl: string;
    accessToken: string;
    /**
     * Optional refresh credentials. Required only if you want the SDK to
     * auto-refresh on 401. Minimal usage works without them:
     *   `createClient({ baseUrl, accessToken })`
     */
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    /** Identifier echoed in `X-Sync-Origin` so this client's own writes don't trigger inbound webhook fanout to itself. */
    originId?: string;
    /** Called whenever the access token is auto-refreshed so the caller can persist it. */
    onTokenRefresh?: (next: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
    }) => void;
}
export declare class ArcanaSyncClient {
    private readonly opts;
    private accessToken;
    private refreshToken?;
    constructor(opts: ArcanaSyncClientOptions);
    private request;
    refresh(): Promise<void>;
    list<T = any>(kind: SyncKind): Promise<{
        data: T[];
    }>;
    get<T = any>(kind: SyncKind, id: string): Promise<SyncEnvelope<T>>;
    getByExternal<T = any>(kind: SyncKind, externalId: string): Promise<SyncEnvelope<T>>;
    /** Create or upsert (uses `externalId` as the key for upsert). */
    upsert<T = any>(kind: SyncKind, body: T & {
        externalId?: string;
        externalUpdatedAt?: string;
    }): Promise<SyncEnvelope<T>>;
    patch<T = any>(kind: SyncKind, id: string, body: Partial<T> & {
        externalUpdatedAt?: string;
    }): Promise<SyncEnvelope<T>>;
    delete(kind: SyncKind, id: string): Promise<{
        ok: true;
    }>;
    listWebhooks(): Promise<{
        data: Array<{
            id: string;
            url: string;
            active: boolean;
            createdAt: string;
        }>;
    }>;
    /** Returns the secret ONCE — store it. Used to verify incoming webhooks. */
    registerWebhook(url: string): Promise<{
        id: string;
        url: string;
        secret: string;
        active: boolean;
    }>;
    deleteWebhook(id: string): Promise<{
        ok: true;
    }>;
    /** Get info about the bearer-token user (admin → global library, otherwise personal AA V2). */
    me(): Promise<{
        id: string;
        isAdmin: boolean;
        scopes: string[];
        libraryRouting: "global-admin" | "personal-aa-v2";
    }>;
}
export declare class ArcanaSyncError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string);
}
/**
 * Verify an inbound webhook signature using HMAC-SHA256.
 * The `body` MUST be the raw request body string (not a re-stringified
 * parsed object). Header is `x-aa-signature` formatted as `sha256=<hex>`.
 */
export declare function verifyWebhookSignature(rawBody: string, secret: string, header: string | undefined): Promise<boolean>;
/** Build the OAuth2 authorize URL with PKCE. */
export declare function buildAuthorizeUrl(opts: {
    baseUrl: string;
    clientId: string;
    redirectUri: string;
    scope?: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod?: "S256" | "plain";
}): string;
/** Exchange an authorization code for tokens. */
export declare function exchangeAuthorizationCode(opts: {
    baseUrl: string;
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    codeVerifier?: string;
}): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
}>;
/** PKCE helpers for partner apps that don't already have one. */
export declare function generatePkce(): {
    codeVerifier: string;
    codeChallenge: string;
};
/** Compute the S256 code_challenge for a given verifier. */
export declare function hashChallenge(codeVerifier: string): Promise<string>;
//# sourceMappingURL=index.d.ts.map