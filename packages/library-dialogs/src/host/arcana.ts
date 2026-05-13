/**
 * Arcana host adapter factories.
 *
 * Two flavors:
 *
 * 1. `arcanaHostAdapter(...)` — same-origin OAuth flow. Mints an
 *    `ArcanaSyncClient` against the bearer token belonging to the user's
 *    session. Used when the calling code already has a token in hand.
 *
 * 2. `arcanaSessionHostAdapter(...)` — cookie-auth flow. Takes a
 *    host-supplied `LibraryTransport` shim that wraps the app's existing
 *    `api.*` REST methods (which authenticate via session cookies). This
 *    is the path the Arcana app itself uses when migrating its inline
 *    dialogs over to the package — no new backend routes required, no
 *    OAuth round-trip, no token storage.
 *
 * Partners should NOT use either of these — both assume Arcana-side
 * dependencies exist. Use `minimalHostAdapter` instead.
 *
 * NOTE: these factories only wire the seams that don't require Arcana's
 * runtime to be loaded. Anything Arcana-specific (toast hook, image
 * browser component, modal component, REST client) must be supplied by
 * the caller at the migration site so this file stays dependency-free.
 */
import type {
  HostAdapter,
  LibraryTransport,
  NotifyLevel,
  ImagePickerOpts,
  HostModalComponent,
} from "../types";
import { ArcanaSyncClient } from "@arcana/aa-sync-sdk";

export interface ArcanaHostOptions {
  /** Same-origin sync client. Token comes from the Arcana session. */
  baseUrl?: string;
  accessToken: string;
  refreshToken?: string;
  /** Bridge to Arcana's toast system. */
  notify: (level: NotifyLevel, message: string) => void;
  /** Bridge to Arcana's <ImageBrowser>. */
  imagePicker?: (opts: ImagePickerOpts) => Promise<{ url: string } | null>;
  /** Bridge to Arcana's existing Dialog chrome (Radix-based). */
  modal?: HostModalComponent;
}

export function arcanaHostAdapter(opts: ArcanaHostOptions): HostAdapter {
  const transport = new ArcanaSyncClient({
    baseUrl: opts.baseUrl ?? (typeof window !== "undefined" ? window.location.origin : ""),
    accessToken: opts.accessToken,
    refreshToken: opts.refreshToken,
    originId: "arcana-internal",
  });
  return {
    transport,
    notify: opts.notify,
    imagePicker: opts.imagePicker,
    modal: opts.modal,
  };
}

export interface ArcanaSessionHostOptions {
  /**
   * Host-supplied transport shim. Implementations typically wrap the
   * app's existing REST `api.*` methods (which authenticate via session
   * cookies) and translate dialog kinds → endpoint paths. Must satisfy
   * `LibraryTransport`'s list/get/upsert/patch/delete contract.
   */
  transport: LibraryTransport;
  /** Bridge to Arcana's toast system. */
  notify: (level: NotifyLevel, message: string) => void;
  /** Bridge to Arcana's <ImageBrowser>. */
  imagePicker?: (opts: ImagePickerOpts) => Promise<{ url: string } | null>;
  /** Bridge to Arcana's existing Dialog chrome (Radix-based). */
  modal?: HostModalComponent;
}

/**
 * Cookie-auth host adapter. The caller assembles a `LibraryTransport`
 * shim from existing in-app REST methods and hands it in directly — no
 * OAuth token, no SDK instance, no new backend routes. The shim MUST
 * return `SyncEnvelope`-shaped objects from `get`/`upsert`/`patch`
 * (`{ kind, id, externalId, data }`), matching `LibraryTransport`'s
 * declared signature. Hosts that have raw row data should wrap it
 * inside a `data` field at the shim boundary — see `MIGRATION.md`.
 */
export function arcanaSessionHostAdapter(opts: ArcanaSessionHostOptions): HostAdapter {
  return {
    transport: opts.transport,
    notify: opts.notify,
    imagePicker: opts.imagePicker,
    modal: opts.modal,
  };
}
