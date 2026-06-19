/**
 * Arcana host adapter factory.
 *
 * `arcanaSessionHostAdapter(...)` — cookie-auth flow. Takes a
 * host-supplied `LibraryTransport` shim that wraps the app's existing
 * `api.*` REST methods (which authenticate via session cookies). This
 * is the path the Arcana app itself uses for its in-app dialogs — no
 * new backend routes required, no OAuth round-trip, no token storage.
 *
 * NOTE: this factory only wires the seams that don't require Arcana's
 * runtime to be loaded. Anything Arcana-specific (toast hook, image
 * browser component, modal component, REST client) must be supplied by
 * the caller at the mount site so this file stays dependency-free.
 */
import type { ComponentType } from "react";
import type {
  HostAdapter,
  LibraryTransport,
  NotifyLevel,
  ImagePickerOpts,
  HostModalComponent,
} from "../types";

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
  /** Bridge to Arcana's spellbook pre-load manager (AA V3). */
  spellbookManager?: ComponentType<{ itemId?: string; maxSpells: number; campaignSystem?: string }>;
  /** Bridge to Arcana's V3 technique group list (AA V3 weapons). */
  techniqueGroups?: () => Promise<{ id: string; name: string }[]>;
}

/**
 * Cookie-auth host adapter. The caller assembles a `LibraryTransport`
 * shim from existing in-app REST methods and hands it in directly — no
 * OAuth token, no new backend routes. The shim MUST return
 * `SyncEnvelope`-shaped objects from `get`/`upsert`/`patch`
 * (`{ kind, id, externalId, data }`), matching `LibraryTransport`'s
 * declared signature. Hosts that have raw row data should wrap it
 * inside a `data` field at the shim boundary.
 */
export function arcanaSessionHostAdapter(opts: ArcanaSessionHostOptions): HostAdapter {
  return {
    transport: opts.transport,
    notify: opts.notify,
    imagePicker: opts.imagePicker,
    modal: opts.modal,
    spellbookManager: opts.spellbookManager,
    techniqueGroups: opts.techniqueGroups,
  };
}
