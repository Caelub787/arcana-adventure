/**
 * Minimal host adapter factory.
 *
 * The simplest path for partners: pass a base URL and an OAuth bearer
 * token; we construct an `@arcana/aa-sync-sdk` client and route notify
 * to console.warn. Partners typically swap `notify` for their toast
 * system and pass an `imagePicker` immediately.
 */
import { ArcanaSyncClient } from "@arcana/aa-sync-sdk";
import type { HostAdapter, NotifyLevel, ImagePickerOpts, HostModalComponent } from "../types";

export interface MinimalHostOptions {
  baseUrl: string;
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  originId?: string;
  notify?: (level: NotifyLevel, message: string) => void;
  imagePicker?: (opts: ImagePickerOpts) => Promise<{ url: string } | null>;
  modal?: HostModalComponent;
  onTokenRefresh?: (next: { accessToken: string; refreshToken: string; expiresAt: number }) => void;
}

export function minimalHostAdapter(opts: MinimalHostOptions): HostAdapter {
  const transport = new ArcanaSyncClient({
    baseUrl: opts.baseUrl,
    accessToken: opts.accessToken,
    refreshToken: opts.refreshToken,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    originId: opts.originId,
    onTokenRefresh: opts.onTokenRefresh,
  });
  return {
    transport,
    notify: opts.notify ?? ((level, message) => {
      const fn = level === "error" ? console.error : level === "warning" ? console.warn : console.log;
      fn(`[library-dialogs:${level}] ${message}`);
    }),
    imagePicker: opts.imagePicker,
    modal: opts.modal,
  };
}
