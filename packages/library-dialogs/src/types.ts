/**
 * @arcana/library-dialogs — public type surface
 *
 * The HostAdapter is the single injection seam. Partner apps fill it in
 * to provide transport (any object satisfying `LibraryTransport` —
 * typically a host-supplied shim that wraps existing in-app REST routes),
 * notifications, an optional image picker, and an optional modal slot.
 *
 * Theme is NOT carried on this object — theming is exclusively driven by
 * CSS custom properties (see `theme.css`). This keeps re-skinning a
 * one-line override on the consumer's root element.
 */
import type { ReactNode, ComponentType } from "react";

/** The library entity kinds the dialogs can read/write. */
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

/** Envelope returned by transport get/upsert/patch operations. */
export interface SyncEnvelope<T = any> {
  kind: SyncKind;
  id: string;
  externalId: string | null;
  data: T;
}

export type NotifyLevel = "info" | "success" | "warning" | "error";

/**
 * Minimum transport surface the dialogs use. Hosts supply a shim that
 * wraps their existing `api.*` REST methods (session-cookie auth) — see
 * `arcanaSessionHostAdapter`.
 */
export interface LibraryTransport {
  list<T = any>(kind: SyncKind): Promise<{ data: T[] }>;
  get<T = any>(kind: SyncKind, id: string): Promise<SyncEnvelope<T>>;
  upsert<T = any>(
    kind: SyncKind,
    body: T & { externalId?: string; externalUpdatedAt?: string },
  ): Promise<SyncEnvelope<T>>;
  patch<T = any>(
    kind: SyncKind,
    id: string,
    body: Partial<T> & { externalUpdatedAt?: string },
  ): Promise<SyncEnvelope<T>>;
  delete(kind: SyncKind, id: string): Promise<{ ok: true }>;
  /** Optional — only required for hosts that round-trip externalId. */
  getByExternal?<T = any>(kind: SyncKind, externalId: string): Promise<SyncEnvelope<T>>;
}

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
  /**
   * Pre-configured transport. Any object satisfying `LibraryTransport`
   * works — letting hosts wire the dialogs to existing in-app REST
   * routes via a thin shim.
   */
  transport: LibraryTransport;

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

  /**
   * Optional. Partner-supplied surface for managing the spells pre-loaded
   * into a spellbook item (AA V3). Rendered inside the ItemDialog's
   * "Spellbook" section once the item has been saved (so an itemId exists).
   * The package stays dependency-free; the host supplies the component.
   */
  spellbookManager?: ComponentType<{ itemId?: string; maxSpells: number; campaignSystem?: string }>;

  /**
   * Optional. Lists the AA V3 weapon technique groups an admin has defined,
   * so the ItemDialog can offer them as assignable options on a weapon item.
   * Absent in non-V3 hosts; the dialog simply hides the selector.
   */
  techniqueGroups?: () => Promise<{ id: string; name: string }[]>;

  /**
   * Optional. Lists the AA V3 "Advanced Item Types" an admin has defined,
   * so the ItemDialog can offer them as a single-select tag on any item.
   * Absent in non-V3 hosts; the dialog simply hides the selector.
   */
  advancedItemTypes?: () => Promise<{ id: string; name: string }[]>;

  /**
   * Optional. Lists the AA V3 ammunition types an admin has defined, so the
   * ItemDialog can offer them as a picker (which type an ammunition item IS,
   * and which type a ranged weapon USES). Absent in non-V3 hosts.
   */
  ammunitionTypes?: () => Promise<{ id: string; name: string }[]>;
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
  /**
   * When `mode === "edit"`, MUST include an internal `id` (the dialog's
   * transport methods key on internal id). Hosts that only have an
   * `externalId` should resolve it to an internal id (e.g. via
   * `host.transport.getByExternal(...)`) BEFORE opening the dialog.
   * `externalId` is accepted on the shape for round-tripping but is not
   * used to drive the load/patch path.
   */
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

