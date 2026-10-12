// Agnostic — a fully notes-based, GM-customisable game system.
//
// Three layers, kept deliberately separate (see docs in shared/agnostic/README.md):
//   DATA         notes, fields, links, regions, actions, modifiers — the single
//                source of truth, held authoritatively by the server.
//   TEMPLATE     templates are themselves notes (isTemplate) whose fields /
//                layout / actions are cloned into new sheets.
//   PRESENTATION sheet documents (TipTap/Yjs), tracker card designs, token bar
//                configs — all of which only ever *reference* data by FieldRef,
//                never copy it.
//
// Everything here is plain JSON so it travels over the wire unchanged.

// ---------------------------------------------------------------------------
// Scopes: where a note lives. Admin library, a user's own library, or a
// campaign. Notes never cross scopes except by an explicit copy.
// ---------------------------------------------------------------------------
export type AgScopeKind = "admin" | "library" | "campaign";
export interface AgScope {
  kind: AgScopeKind;
  /** campaign id for kind=campaign, owning user id for kind=library, "admin" for admin. */
  id: string;
}
export const scopeKey = (s: AgScope) => `${s.kind}:${s.id}`;
export function parseScopeKey(key: string): AgScope | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  const kind = key.slice(0, i) as AgScopeKind;
  if (kind !== "admin" && kind !== "library" && kind !== "campaign") return null;
  return { kind, id: key.slice(i + 1) };
}

// ---------------------------------------------------------------------------
// Permissions. GM always passes. Audiences are additive.
// ---------------------------------------------------------------------------
export type AgAudience =
  | "gm"
  | "owners"
  | "everyone"
  | { owners?: boolean; users: string[] };
export type AgAudienceOrInherit = AgAudience | "inherit";
export interface AgAcl {
  view: AgAudienceOrInherit;
  edit: AgAudienceOrInherit;
}
export const ACL_INHERIT: AgAcl = { view: "inherit", edit: "inherit" };

// ---------------------------------------------------------------------------
// Note types. Built-ins are what the libraries show; GMs can add more by
// making a template with a new type name.
// ---------------------------------------------------------------------------
export interface AgNoteTypeDef {
  id: string;
  label: string;
  plural: string;
  icon: string; // lucide icon name
  /** Shown as a section in Admin / My Library. */
  library: boolean;
}
export const AG_BUILTIN_TYPES: AgNoteTypeDef[] = [
  { id: "character", label: "Character", plural: "Characters", icon: "User", library: true },
  { id: "npc", label: "NPC", plural: "NPCs", icon: "Skull", library: false },
  { id: "item", label: "Item", plural: "Items", icon: "Package", library: true },
  { id: "species", label: "Species", plural: "Species", icon: "Dna", library: true },
  { id: "location", label: "Location", plural: "Locations", icon: "MapPin", library: false },
  { id: "note", label: "Note", plural: "Notes", icon: "StickyNote", library: false },
];
export const agTypeLabel = (type: string) =>
  AG_BUILTIN_TYPES.find((t) => t.id === type)?.label ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : "Note");

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
export interface AgTokenBar {
  id: string;
  /** FieldRef of the current value (e.g. "hp"). */
  value: string;
  /** FieldRef of the maximum (e.g. "hp_max"); omitted → bar shows value only. */
  max?: string;
  color: string;
  showNumbers?: boolean;
  label?: string;
}

export interface AgTemplateMeta {
  version: number;
  description?: string;
  /** Last time "Save version" was pressed. */
  savedAt?: number;
}

export interface AgNote {
  id: string;
  scope: AgScopeKind;
  scopeId: string;
  type: string;
  isTemplate: boolean;
  templateMeta: AgTemplateMeta | null;
  templateId: string | null;
  templateVersion: number | null;
  name: string;
  portrait: string | null;
  ownerIds: string[];
  /** Header (name, portrait, existence) visibility + note-level edit (rename, portrait). */
  acl: AgAcl;
  /** Sheet body (main document). "inherit" → acl. */
  bodyAcl: AgAcl;
  tokenBars: AgTokenBar[] | null;
  folder: string | null;
  sortOrder: number;
  /** Bumped when the documents are replaced wholesale (restore / template switch); docs are named per epoch. */
  docEpoch: number;
  createdAt: number;
  updatedAt: number;
}

export type AgFieldType = "number" | "text" | "boolean" | "select" | "formula" | "dice" | "image";

export interface AgFieldOptions {
  min?: number;
  max?: number;
  step?: number;
  /** For select fields. */
  choices?: string[];
  /** Display precision for numbers/formulas. */
  decimals?: number;
  color?: string;
  /** Formula fields may produce text; default number. */
  resultType?: "number" | "text";
}

export interface AgField {
  id: string;
  noteId: string;
  key: string;
  label: string;
  type: AgFieldType;
  /** Base value as stored (number | string | boolean | null). Formula fields: unused. */
  value: AgValue;
  /** Formula fields: the expression. Dice fields: the dice expression. */
  formula: string | null;
  options: AgFieldOptions;
  acl: AgAcl;
  sortOrder: number;
  templateFieldId: string | null;
  /** Effective value after formula evaluation + incoming modifiers (server-computed). */
  eff?: AgValue;
  /** Evaluation error, if any (e.g. "#CYCLE", "unknown field hp"). */
  err?: string | null;
}

export type AgValue = number | string | boolean | null;

export interface AgRegion {
  id: string;
  noteId: string;
  acl: AgAcl;
  inline: boolean;
  label: string | null;
  templateRegionId: string | null;
}

export interface AgLink {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  /** How `from` refers to `to` in formulas, e.g. "owner" on an item. */
  label: string;
  /** How `to` refers back to `from`, e.g. "items" on a character. */
  reverseLabel: string;
  acl: AgAcl;
  createdAt: number;
}

/** An item (or any note) changing a value on notes it's connected to. */
export interface AgModifier {
  id: string;
  /** The note doing the modifying (e.g. the sword). */
  noteId: string;
  /** Connection label from noteId to the target(s), e.g. "owner". "self" targets this note. */
  via: string;
  /** Field key on the target, e.g. "str". */
  targetKey: string;
  op: "add" | "multiply";
  /** Formula evaluated on the modifying note (may reference its own fields). */
  amount: string;
  /** Optional formula; modifier applies only when truthy (e.g. "equipped"). */
  condition: string | null;
  label: string | null;
}

// ---------------------------------------------------------------------------
// Actions — no-code functions behind buttons.
// ---------------------------------------------------------------------------
export type AgActionStep =
  | { type: "roll"; name: string; expr: string; label?: string }
  | { type: "modify"; target: string; op: "set" | "add" | "subtract"; value: string }
  | { type: "message"; text: string };

export interface AgAction {
  id: string;
  noteId: string;
  name: string;
  steps: AgActionStep[];
  /** view = who can see the button, edit = who can press it. */
  acl: AgAcl;
  color: string | null;
}

export interface AgActionResultRoll {
  name: string;
  label: string;
  expr: string;
  total: number;
  breakdown: string;
}
export interface AgActionResult {
  rolls: AgActionResultRoll[];
  changes: { noteId: string; key: string; from: AgValue; to: AgValue }[];
  messages: string[];
}

// ---------------------------------------------------------------------------
// Presentation: free-form layouts (canvas blocks, tracker cards, components).
// Coordinates are in design pixels; renderers scale the whole layout to fit.
// ---------------------------------------------------------------------------
export type AgFieldDisplay = "value" | "input" | "bar" | "pips" | "badge" | "dial" | "label";

export type AgWidget =
  | { kind: "field"; ref: string; maxRef?: string; display: AgFieldDisplay; label?: string; showLabel?: boolean; color?: string; fontSize?: number; align?: "left" | "center" | "right" }
  | { kind: "text"; text: string; fontSize?: number; color?: string; bold?: boolean; align?: "left" | "center" | "right" }
  | { kind: "richtext"; regionId: string }
  | { kind: "image"; src?: string | null; ref?: string; fit?: "cover" | "contain"; radius?: number }
  | { kind: "portrait"; radius?: number }
  | { kind: "name"; fontSize?: number; color?: string; align?: "left" | "center" | "right" }
  | { kind: "button"; actionId: string; label?: string }
  | { kind: "chart"; chart: "bar" | "radar" | "line" | "pie"; refs: string[]; maxRef?: string }
  | { kind: "links"; label: string; columns: string[] }
  | { kind: "component"; componentId: string; bindings: Record<string, string> }
  | { kind: "shape"; shape: "rect" | "circle" | "line"; color: string; border?: string; radius?: number; opacity?: number }
  | { kind: "lastRoll" };

export interface AgLayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  widget: AgWidget;
  /** Presentation-level hide (data is still protected by field ACLs regardless). */
  showTo?: AgAudience;
}

export interface AgLayout {
  width: number;
  height: number;
  background?: string;
  border?: string;
  radius?: number;
  items: AgLayoutItem[];
}

/** A reusable component: a small layout with named parameters ($hp, $max…). */
export interface AgComponentDef {
  id: string;
  scope: AgScopeKind;
  scopeId: string;
  name: string;
  /** Parameter names (without $) the layout's FieldRefs use as `$name`. */
  params: string[];
  layout: AgLayout;
  updatedAt: number;
}

export interface AgTrackerCard {
  id: string;
  name: string;
  layout: AgLayout;
}

export interface AgCampaignSettings {
  tracker: {
    placement: "top" | "left" | "right" | "bottom";
    /** Note ids shown in the tracker, in order. */
    pinned: string[];
    cards: AgTrackerCard[];
    /** note type → card id */
    cardByType: Record<string, string>;
    /** note id → card id */
    cardByNote: Record<string, string>;
    scale: number;
  };
  /** note type → default token bars when a note has none of its own. */
  tokenBarsByType: Record<string, AgTokenBar[]>;
}

export const DEFAULT_TRACKER_CARD: AgTrackerCard = {
  id: "default",
  name: "Default card",
  layout: {
    width: 180,
    height: 76,
    background: "rgba(28,25,23,0.92)",
    border: "#78350f",
    radius: 10,
    items: [
      { id: "p", x: 6, y: 6, w: 52, h: 52, widget: { kind: "portrait", radius: 8 } },
      { id: "n", x: 64, y: 6, w: 110, h: 18, widget: { kind: "name", fontSize: 13, color: "#fde68a" } },
      { id: "b1", x: 64, y: 30, w: 110, h: 12, widget: { kind: "field", ref: "hp", maxRef: "hp_max", display: "bar", color: "#16a34a" } },
      { id: "r", x: 6, y: 60, w: 168, h: 12, widget: { kind: "lastRoll" } },
    ],
  },
};

export function defaultCampaignSettings(): AgCampaignSettings {
  return {
    tracker: { placement: "top", pinned: [], cards: [DEFAULT_TRACKER_CARD], cardByType: {}, cardByNote: {}, scale: 1 },
    tokenBarsByType: {
      character: [{ id: "hp", value: "hp", max: "hp_max", color: "#16a34a" }],
      npc: [{ id: "hp", value: "hp", max: "hp_max", color: "#dc2626" }],
    },
  };
}

// ---------------------------------------------------------------------------
// Versions & export
// ---------------------------------------------------------------------------
export interface AgSnapshot {
  note: Omit<AgNote, "id" | "createdAt" | "updatedAt" | "docEpoch" | "scope" | "scopeId">;
  fields: Omit<AgField, "eff" | "err">[];
  regions: AgRegion[];
  actions: AgAction[];
  modifiers: AgModifier[];
  /** Document states keyed by logical name ("note" or "region:<id>"), base64 Yjs updates. */
  docs: Record<string, string>;
}

export interface AgVersionMeta {
  id: string;
  noteId: string;
  reason: string;
  label: string | null;
  createdAt: number;
  createdBy: string | null;
}

export interface AgExportBundle {
  format: "arcana-agnostic";
  version: 1;
  exportedAt: number;
  templates: AgSnapshot[];
  components: Omit<AgComponentDef, "id" | "scope" | "scopeId" | "updatedAt">[];
  trackerCards?: AgTrackerCard[];
}

// ---------------------------------------------------------------------------
// Viewer context (who is looking) — used by ACL checks on both sides.
// ---------------------------------------------------------------------------
export interface AgViewer {
  userId: string;
  isGM: boolean;
}

// Logical document names. The server stores them with the note's epoch.
export const noteDocName = (noteId: string, epoch: number) => `note:${noteId}:${epoch}`;
export const regionDocName = (regionId: string, epoch: number) => `region:${regionId}:${epoch}`;
export function parseDocName(name: string): { kind: "note" | "region"; id: string; epoch: number } | null {
  const m = /^(note|region):([^:]+):(\d+)$/.exec(name);
  return m ? { kind: m[1] as "note" | "region", id: m[2], epoch: Number(m[3]) } : null;
}

/** Field keys are what formulas use: lowercase, a-z0-9_ and starting with a letter. */
export function slugifyKey(label: string): string {
  const k = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(k) ? k.slice(0, 40) : `f_${k}`.slice(0, 40);
}
export const isValidKey = (k: string) => /^[a-z][a-z0-9_]{0,39}$/.test(k);
