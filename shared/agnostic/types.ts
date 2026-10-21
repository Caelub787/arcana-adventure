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

/**
 * Libraries per system. Plain Agnostic keeps the original ids (the user's id,
 * "admin"); each system built on Agnostic gets its own, e.g. "<user>:ca-agnostic"
 * and "admin:ca-agnostic", so their items never mix.
 */
export function agLibraryScope(kind: "library" | "admin", userId: string, system?: string | null): AgScope {
  const base = kind === "admin" ? "admin" : userId;
  return { kind, id: !system || system === "agnostic" ? base : `${base}:${system}` };
}
/** Which system a library belongs to ("agnostic" for the original ones); null for campaigns. */
export function agLibrarySystem(scope: AgScope): string | null {
  if (scope.kind === "campaign") return null;
  const i = scope.id.lastIndexOf(":");
  return i < 0 ? "agnostic" : scope.id.slice(i + 1);
}
/** The user (or "admin") a library belongs to. */
export function agLibraryOwner(scope: AgScope): string {
  const i = scope.id.lastIndexOf(":");
  return i < 0 ? scope.id : scope.id.slice(0, i);
}
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
/**
 * How something looks: size, colours, text, style. Every insert on a sheet,
 * every canvas / tracker / component item and every token bar carries one,
 * so anything can be resized and restyled without touching the data.
 * All optional — missing keys fall back to each widget's defaults.
 */
export interface AgLook {
  /** Explanation shown behind a "?" next to this insert. */
  tooltip?: string;
  /** Blocks on a sheet: width as % of the line (10–100). */
  width?: number;
  align?: "left" | "center" | "right";
  /** Bar thickness / pip size / dial size / chart & table height / button height (px). */
  height?: number;
  /** Buttons & inline values: minimum width (px). */
  minWidth?: number;
  /** Main colour: bar fill, pips, dial ring, chart, button, badge border. */
  color?: string;
  /** The empty part of bars / pips / dials. */
  track?: string;
  textColor?: string;
  labelColor?: string;
  /** Background and outline around the whole block. */
  bg?: string;
  outline?: string;
  /** The widget's own border (bar, badge, button, table). */
  border?: string;
  radius?: number;
  padding?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  labelPos?: "above" | "left" | "right" | "below" | "inside" | "none";
  /** Small-caps style labels (and badge text). */
  labelUpper?: boolean;
  labelSize?: number;
  /** What numbers a bar / dial shows. */
  numbers?: "fraction" | "value" | "percent" | "none";
  barStyle?: "solid" | "gradient" | "striped" | "segments" | "glow";
  /** Bars can grow from the right or vertically. */
  direction?: "right" | "left" | "up";
  shape?: "circle" | "square" | "diamond" | "heart" | "star";
  /** Columns: gap between columns (px) and relative widths ("1:2"). */
  gap?: number;
  ratio?: string;
  /** Buttons: show the dice icon. */
  icon?: boolean;
  /** Text after a value, e.g. "lbs" or "ft". */
  suffix?: string;
  /** An icon (by name) shown before a value / label / button text. */
  iconName?: string;
  iconColor?: string;
  /** Overall zoom for components / canvases placed on a sheet (0.25–4). */
  scale?: number;
}

export interface AgTokenBar {
  id: string;
  /** FieldRef of the current value (e.g. "hp"). */
  value: string;
  /** FieldRef of the maximum (e.g. "hp_max"); omitted → bar shows value only. */
  max?: string;
  color: string;
  showNumbers?: boolean;
  label?: string;
  look?: AgLook;
}

export interface AgTemplateMeta {
  version: number;
  description?: string;
  /**
   * Players may add a new sheet from this template to a sheet they can edit
   * (e.g. an item into their own inventory) and remove ones they added.
   * Everything else about creating sheets stays GM-only.
   */
  playersCanCreate?: boolean;
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
  /**
   * Can see it and press its buttons and rolls, but not change anything (unlike
   * owners). Set from the sheets it's on: an item on a character is used by that
   * character's players; the GM makes someone an owner to let them edit it.
   */
  userIds?: string[];
  /** Header (name, portrait, existence) visibility + note-level edit (rename, portrait). */
  acl: AgAcl;
  /** Sheet body (main document). "inherit" → acl. */
  bodyAcl: AgAcl;
  tokenBars: AgTokenBar[] | null;
  folder: string | null;
  sortOrder: number;
  /** Bumped when the documents are replaced wholesale (restore / template switch); docs are named per epoch. */
  docEpoch: number;
  /**
   * A sheet's own copy of another — an item given to a character, with its own
   * notes: what it was copied from. Its owners follow the sheets it's attached
   * to; dragging it somewhere else moves it rather than copying it again.
   */
  copyOf?: string | null;
  /**
   * The size its window opens at, for everyone. Set by resizing a template's
   * window (the GM); every sheet made from that template gets it.
   */
  windowSize?: { width: number; height: number } | null;
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
  /** Choice (and text) values: a colour per value, used by badges / values (e.g. rarity). */
  choiceColors?: Record<string, string>;
  /** Explanation shown behind a "?" wherever this value appears (see tooltip format in tipFormat.ts). */
  tooltip?: string;
  /**
   * A current value that goes up with its maximum: when that value (a key on the
   * same sheet, e.g. "hp_max") rises by 5, this one rises by 5 too; when it
   * drops, this one is kept within it. E.g. HP gaining a rank's extra health.
   */
  follows?: string;
  /**
   * Temporary points that soak up losses first (a key on the same sheet, e.g.
   * "temp_hp"): taking 5 off this value takes it from those first. Bars show
   * them as a green layer on top.
   */
  shield?: string;
  /** Text that is a colour ("#a78bfa"): edited with a colour picker; tags showing this sheet use it. */
  isColor?: boolean;
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
/** Every step can be skipped by a condition ("only if"), a formula like `qty <= 0`. */
interface AgStepBase { when?: string }
export type AgActionStep =
  | ({ type: "roll"; name: string; expr: string; label?: string } & AgStepBase)
  | ({ type: "modify"; target: string; op: "set" | "add" | "subtract"; value: string } & AgStepBase)
  | ({ type: "message"; text: string } & AgStepBase)
  /**
   * Ask whoever pressed the button to pick one sheet — e.g. which of the
   * owner's wounds a potion heals. `from` is a connection path ("@owner.wounds");
   * `filter` keeps only sheets where it is true (evaluated on each one).
   * Later steps reach the pick as @<name>.value / $… just like @target.
   */
  | ({ type: "choose"; name: string; from: string; filter?: string; prompt?: string } & AgStepBase)
  /** Delete a sheet: "self" (the sheet the button is on) or a chosen one. */
  | ({ type: "remove"; target: string } & AgStepBase)
  /** End the button here (with "Only if": e.g. stop when there isn't enough Energy). */
  | ({ type: "stop" } & AgStepBase)
  /**
   * Roll and put the sheet into the campaign's initiative order with the result
   * (the sheet itself if it's a character / NPC, else the character it hangs off).
   */
  | ({ type: "initiative"; expr: string; label?: string } & AgStepBase);

/** Something a roll spends from the sheet that rolls, e.g. Energy. */
export interface AgRollCost {
  /** Value key on the rolling sheet ("energy"). */
  key: string;
  /** Formula on this sheet: how much ("10"). */
  amount: string;
}

/**
 * A roll set up with simple boxes instead of steps: how many dice, what size,
 * what's added, and what it costs. Runs before any steps the action also has.
 */
export interface AgRollSpec {
  /** The connection from this sheet to the sheet that rolls and pays ("holder", "owner"); "" = this sheet. */
  via: string;
  /** How many dice (formula). */
  count: string;
  /** Die size (formula): "20", or a value on the roller such as "@holder.might_die". */
  die: string;
  /** A value on the roller added to the roll, e.g. a skill ("athletics"); "" for none. */
  add: string;
  /** A flat bonus (formula on this sheet). */
  bonus: string;
  costs: AgRollCost[];
}

/** How a button looks and where it shows, plus an optional simple roll. */
export interface AgActionOptions {
  roll?: AgRollSpec;
  /** Button icon: a Font Awesome class ("fa-solid fa-dice-d20") or an icon name ("Dices"). */
  icon?: string;
  /** Show the name on the button (default yes). */
  showName?: boolean;
  /** Show the icon on the button (default yes). */
  showIcon?: boolean;
  /** Show this button on the sheets this one belongs to (a character's ability list or inventory). Default yes. */
  listed?: boolean;
  /** Order among the sheet's buttons. */
  sortOrder?: number;
  /**
   * Made by a player for their hotbar (on a sheet they own): a roll of that sheet's
   * own values only — no steps — so it can't change or read anything else. The
   * player can change or delete it; the GM can change anything about it.
   */
  playerMade?: boolean;
}

/** Long-press a roll: advantage / disadvantage and a one-off modifier. */
export interface AgRollMods {
  mode?: "adv" | "dis" | null;
  /** Added to the total of every roll this press makes. */
  bonus?: number;
}

/** What a "choose" step offers before the button runs. */
export interface AgActionChoice {
  name: string;
  prompt: string;
  options: Array<{ id: string; name: string; portrait: string | null; sub?: string }>;
}

export interface AgAction {
  id: string;
  noteId: string;
  name: string;
  steps: AgActionStep[];
  /** view = who can see the button, edit = who can press it. */
  acl: AgAcl;
  color: string | null;
  options?: AgActionOptions;
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
  /** An initiative step put this sheet into the order. */
  initiative?: { noteId: string; name: string; total: number };
}

// ---------------------------------------------------------------------------
// Presentation: free-form layouts (canvas blocks, tracker cards, components).
// Coordinates are in design pixels; renderers scale the whole layout to fit.
// ---------------------------------------------------------------------------
export type AgFieldDisplay = "value" | "input" | "bar" | "pips" | "badge" | "dial" | "label";

export type AgWidget =
  | { kind: "field"; ref: string; maxRef?: string; display: AgFieldDisplay; label?: string; showLabel?: boolean; color?: string; fontSize?: number; align?: "left" | "center" | "right"; look?: AgLook }
  | { kind: "text"; text: string; fontSize?: number; color?: string; bold?: boolean; align?: "left" | "center" | "right"; look?: AgLook }
  | { kind: "richtext"; regionId: string; look?: AgLook }
  | { kind: "image"; src?: string | null; ref?: string; fit?: "cover" | "contain"; radius?: number; look?: AgLook }
  | { kind: "portrait"; radius?: number; look?: AgLook }
  | { kind: "name"; fontSize?: number; color?: string; align?: "left" | "center" | "right"; look?: AgLook }
  | { kind: "button"; actionId: string; label?: string; look?: AgLook }
  | { kind: "chart"; chart: "bar" | "radar" | "line" | "pie"; refs: string[]; maxRef?: string; look?: AgLook }
  | { kind: "links"; label: string; columns: Array<string | AgLinkColumn>; config?: AgLinksConfig; look?: AgLook }
  | { kind: "component"; componentId: string; bindings: Record<string, string>; look?: AgLook }
  | { kind: "shape"; shape: "rect" | "circle" | "line"; color: string; border?: string; radius?: number; opacity?: number }
  | { kind: "lastRoll" }
  | { kind: "icon"; name: string; color?: string; look?: AgLook };

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

/**
 * A reusable component: a small layout with named parameters ($hp, $max…).
 * A parameter left unconnected where the component is placed uses the
 * sheet's own value with the same key — so "$hp" just works on any sheet
 * that has an "hp" value.
 */
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

/** A column of a connections table / inventory: a value on each connected sheet. */
export interface AgLinkColumn {
  ref: string;
  label?: string;
  /**
   * button: `ref` is the name of a button on each connected sheet (e.g. "use"); text: long text shown in full;
   * rolls: every button on the connected sheet marked "show on the character sheet", with what it rolls and costs;
   * effects: what the connected sheet changes on others ("Athletics −2");
   * connection: `ref` is a connection of the row's sheet (e.g. "ability"): those sheets as tags, in their colour.
   */
  display?: "value" | "input" | "bar" | "badge" | "toggle" | "button" | "text" | "rolls" | "effects" | "connection";
  /** Bars: the max value (another key on the same sheet). */
  maxRef?: string;
  color?: string;
  /** Shown after the value, e.g. "lbs". */
  suffix?: string;
}

/** How a connections table behaves — enough to build a full inventory. */
export interface AgLinksConfig {
  /**
   * icons: a small picture per sheet. Hover it (tap on a phone) for its columns —
   * rolls work right there; click it (double-tap / hold on a phone) to open it.
   * A button shows every one in full, remembered per viewer on their device.
   */
  layout?: "table" | "cards" | "icons";
  /** Icons shown in full: their columns (default), or each one's whole page. */
  expand?: "columns" | "page";
  /** Icons: their size in pixels (default 40). */
  iconSize?: number;
  search?: boolean;
  /** "name" or a column key. */
  sortBy?: string;
  /** Filter chips from this column's values (e.g. item type, or a connection column: which ability). */
  filterBy?: string;
  /** Card border coloured by this column's choice colour (e.g. rarity). */
  accentBy?: string;
  /**
   * Adding: which kinds of sheet, and what the new sheet calls this one (e.g. "owner").
   * copy: an existing sheet added here (picked, or dragged from the sidebar) becomes this
   * sheet's own copy, kept in `copyFolder`; the original stays as it was. A copy added
   * somewhere else moves there.
   */
  add?: { types?: string[]; reverse?: string; existing?: boolean; copy?: boolean; copyFolder?: string; /** false: only existing sheets can be added (nothing new is made here). */ createNew?: boolean } | null;
  remove?: "none" | "disconnect" | "delete";
  emptyText?: string;
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
    /** Rolls slide out from under each card for a moment (a dice tray). Default on. */
    diceTray?: boolean;
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
