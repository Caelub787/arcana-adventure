/**
 * Arcana host adapter factory.
 *
 * Used by the Arcana app itself (in the future migration task #61) to
 * mount the package's dialogs against its own infra: existing toast
 * system, image browser, dialog chrome, and a same-origin sync client
 * authenticated via session.
 *
 * Partners should NOT use this — it assumes Arcana-side dependencies
 * exist. Use `minimalHostAdapter` instead.
 *
 * NOTE: this factory only wires the seams that don't require Arcana's
 * runtime to be loaded. Anything Arcana-specific (toast hook, image
 * browser component, modal component) must be supplied by the caller
 * at the migration site so this file stays dependency-free.
 */
import type { HostAdapter, NotifyLevel, ImagePickerOpts, HostModalComponent } from "../types";
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
