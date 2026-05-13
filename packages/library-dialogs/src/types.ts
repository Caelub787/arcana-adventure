/**
 * @arcana/library-dialogs — public type surface
 *
 * The HostAdapter is the single injection seam. Partner apps fill it in
 * to provide transport (a configured @arcana/aa-sync-sdk client),
 * notifications, an optional image picker, and an optional modal slot.
 *
 * Theme is NOT carried on this object — theming is exclusively driven by
 * CSS custom properties (see `theme.css`). This keeps re-skinning a
 * one-line override on the consumer's root element.
 */
import type { ReactNode, ComponentType } from "react";
import type { ArcanaSyncClient, SyncKind } from "@arcana/aa-sync-sdk";

export type NotifyLevel = "info" | "success" | "warning" | "error";

export interface ImagePickerOpts {
  title?: string;
  /** Optional initial value the picker should highlight. */
  initialUrl?: string;
}

export interface HostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Optional partner-supplied modal chrome. Defaults to a centered overlay. */
export type HostModalComponent = ComponentType<HostModalProps>;

export interface HostAdapter {
  /** Pre-configured SDK instance. Library calls go through it. */
  transport: ArcanaSyncClient;

  /**
   * Toast / snackbar entry-point. Package surfaces validation errors,
   * save failures, and stale-write notices through this.
   */
  notify: (level: NotifyLevel, message: string) => void;

  /**
   * Optional. Hand off to the partner's image library / uploader.
   * If absent, package falls back to a plain URL input.
   */
  imagePicker?: (opts: ImagePickerOpts) => Promise<{ url: string } | null>;

  /**
   * Optional. Wrap dialogs in the partner's window/modal chrome (side
   * sheet, popout, full-screen, etc.). If absent, package renders its
   * own centered overlay with default styling.
   */
  modal?: HostModalComponent;
}

/** Stable prop signature shared by every dialog the package exports. */
export interface DialogProps<T = unknown> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Explicit create/edit selector. If omitted, the dialog infers the mode
   * from `initialValue?.id` (id present = edit, absent = create) for
   * back-compat. Pass it explicitly when you want unambiguous behavior.
   */
  mode?: "create" | "edit";
  /** When `mode === "edit"`, must contain at least an `id` or `externalId`. */
  initialValue?: T & { id?: string; externalId?: string };
  /** Called after the entity is persisted via `host.transport`. */
  onSaved?: (saved: T & { id: string; externalId?: string | null }) => void;
  /** Optional cancel hook (in addition to `onOpenChange(false)`). */
  onCancel?: () => void;
  host: HostAdapter;
  /**
   * Optional system slug. Defaults to `"aa-v2"`. Drives system-aware
   * conditionals (e.g. mana, crafter items, AAv2-only template panels).
   */
  campaignSystem?: string;
}

export type { ArcanaSyncClient, SyncKind };
