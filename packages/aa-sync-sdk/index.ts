/**
 * Local stub for `@arcana/aa-sync-sdk`.
 *
 * The real SDK powered Canvas Realms' OPTIONAL "sync to an external Arcana
 * VTT instance" integration. That integration is out of scope for the port
 * into this host app (this host *is* Arcana Adventure), and the SDK source
 * was not part of the CR artifacts. The CR arcana routes are still mounted
 * for completeness, but they only ever reach the SDK once a realm has stored
 * Arcana OAuth credentials — which never happens here — so these degraded
 * implementations are unreachable in normal use.
 *
 * The type exports (`SyncKind`, `SyncEnvelope`) intentionally mirror
 * `@arcana/library-dialogs` so the frontend transport stays assignment
 * compatible.
 */

export type SyncKind =
  | "item"
  | "spell"
  | "character"
  | "species"
  | "class"
  | "feat-tree"
  | "character-template"
  | "roll-template"
  | "element";

export interface SyncEnvelope<T = any> {
  kind: SyncKind;
  id: string;
  externalId: string | null;
  data: T;
}

const DISABLED_MESSAGE =
  "Arcana external sync is not available in this build.";

/** Error type the CR code matches with `instanceof` and reads `.status`/`.code`. */
export class ArcanaSyncError extends Error {
  status?: number;
  code?: string;
  constructor(
    message: string = DISABLED_MESSAGE,
    opts?: { status?: number; code?: string },
  ) {
    super(message);
    this.name = "ArcanaSyncError";
    this.status = opts?.status ?? 503;
    this.code = opts?.code ?? "arcana_sync_disabled";
  }
}

function disabled(): never {
  throw new ArcanaSyncError();
}

export interface ArcanaSyncClientConfig {
  baseUrl: string;
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  originId: string;
  onTokenRefresh?: (tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number | string | Date;
  }) => void;
}

export class ArcanaSyncClient {
  constructor(_config: ArcanaSyncClientConfig) {}
  async upsert(_kind: SyncKind, _payload: Record<string, unknown>): Promise<any> {
    return disabled();
  }
  async patch(
    _kind: SyncKind,
    _id: string,
    _payload: Record<string, unknown>,
  ): Promise<any> {
    return disabled();
  }
  async delete(_kind: SyncKind, _id: string): Promise<any> {
    return disabled();
  }
  async refresh(): Promise<any> {
    return disabled();
  }
}

export function generatePkce(): any {
  return disabled();
}

export function hashChallenge(..._args: any[]): any {
  return disabled();
}

export function buildAuthorizeUrl(..._args: any[]): any {
  return disabled();
}

export async function exchangeAuthorizationCode(..._args: any[]): Promise<any> {
  return disabled();
}

export function verifyWebhookSignature(..._args: any[]): boolean {
  // Reject every webhook: no external Arcana instance is configured.
  return false;
}
