// Agnostic realtime protocol (JSON over the /ws/agnostic websocket).
// Every mutation is an `op`; the server applies it, then pushes the resulting
// entity changes to every connected viewer that is allowed to see them.
import type {
  AgAcl, AgAction, AgActionOptions, AgActionResult, AgActionStep, AgRollMods, AgCampaignSettings, AgComponentDef, AgExportBundle, AgField,
  AgFieldOptions, AgFieldType, AgLayout, AgLink, AgModifier, AgNote, AgRegion, AgScope, AgTokenBar, AgValue, AgVersionMeta,
} from "./types";

export interface AgMember { userId: string; name: string; role: string }

export type AgOp =
  | { op: "note.create"; type: string; name: string; templateId?: string | null; isTemplate?: boolean; folder?: string | null; portrait?: string | null; ownerIds?: string[] }
  | { op: "note.update"; id: string; patch: Partial<Pick<AgNote, "name" | "portrait" | "folder" | "sortOrder" | "ownerIds" | "acl" | "bodyAcl" | "tokenBars" | "type" | "templateMeta">> }
  | { op: "note.delete"; id: string }
  | { op: "note.duplicate"; id: string }
  | { op: "note.copyFrom"; sourceNoteId: string; sourceScope: AgScope; asTemplate?: boolean }
  | { op: "note.switchTemplate"; id: string; templateId: string | null }
  /** Add a new sheet (from a template) connected to a host sheet — an item into an inventory. */
  | { op: "note.createLinked"; hostNoteId: string; templateId?: string | null; type?: string; name?: string; label: string; reverseLabel: string }
  /** Take a connected sheet out of a table: disconnect it, or delete it. */
  | { op: "note.removeLinked"; hostNoteId: string; noteId: string; mode: "disconnect" | "delete" }
  /**
   * Put an existing sheet onto another (dragged from the sidebar onto a character):
   * connected the way the host's list for that kind of sheet adds them (an item into
   * the inventory, an ability into the abilities, a technique into an ability).
   */
  | { op: "note.attach"; hostNoteId: string; noteId: string }
  /** Templates this viewer may add from (players only see ones the GM allowed). */
  | { op: "note.creatableTemplates"; types?: string[] }
  /** Add a ready-made starter kit (templates, and optionally example sheets) to this scope. */
  | { op: "kit.apply"; kit: "ca"; examples?: boolean }
  | { op: "field.create"; noteId: string; label: string; key?: string; type: AgFieldType; value?: AgValue; formula?: string | null; options?: AgFieldOptions; acl?: AgAcl }
  | { op: "field.update"; id: string; patch: Partial<Pick<AgField, "label" | "key" | "type" | "formula" | "options" | "acl" | "sortOrder">> }
  | { op: "field.set"; id: string; value: AgValue }
  | { op: "field.adjust"; id: string; delta: number }
  | { op: "field.delete"; id: string }
  | { op: "region.create"; noteId: string; inline: boolean; acl?: AgAcl; label?: string | null }
  | { op: "region.update"; id: string; patch: Partial<Pick<AgRegion, "acl" | "label">> }
  | { op: "region.delete"; id: string }
  | { op: "link.create"; fromNoteId: string; toNoteId: string; label: string; reverseLabel: string; acl?: AgAcl }
  | { op: "link.update"; id: string; patch: Partial<Pick<AgLink, "label" | "reverseLabel" | "acl">> }
  | { op: "link.delete"; id: string }
  | { op: "modifier.upsert"; modifier: Omit<AgModifier, "id"> & { id?: string } }
  | { op: "modifier.delete"; id: string }
  | { op: "action.upsert"; action: { id?: string; noteId: string; name: string; steps: AgActionStep[]; acl?: AgAcl; color?: string | null; options?: AgActionOptions } }
  | { op: "action.delete"; id: string }
  | { op: "action.run"; id: string; targetNoteIds?: string[]; choices?: Record<string, string>; mods?: AgRollMods }
  | { op: "action.prepare"; id: string; targetNoteIds?: string[] }
  | { op: "settings.update"; settings: AgCampaignSettings }
  | { op: "component.upsert"; component: { id?: string; name: string; params: string[]; layout: AgLayout } }
  | { op: "component.delete"; id: string }
  | { op: "template.saveVersion"; id: string; label?: string | null }
  | { op: "template.apply"; templateId: string; noteIds: string[]; mode: "fields" | "full"; removeMissing: boolean }
  | { op: "version.list"; noteId: string }
  | { op: "version.create"; noteId: string; label?: string | null }
  | { op: "version.restore"; versionId: string }
  | { op: "export"; templateIds: string[]; componentIds: string[]; includeGmText: boolean; includeTracker: boolean }
  | { op: "import"; bundle: AgExportBundle }
  | { op: "eval"; noteId: string; expr: string };

export type AgOpResult =
  | { noteId: string }
  | { versionId: string }
  | { versions: AgVersionMeta[] }
  | { result: AgActionResult; noteName: string; rollerName?: string; initiative?: { name: string; total: number } }
  | { bundle: AgExportBundle }
  | { value: AgValue | AgValue[]; error?: string }
  | { ok: true }
  | Record<string, unknown>;

/** Action as sent to viewers: steps only for those who may design. */
/** Players get a button without its steps; `asks` says it starts with a "choose" (so the client asks first). */
export type AgActionView = Omit<AgAction, "steps"> & { steps: AgActionStep[] | null; asks?: boolean };

export type AgClientMsg =
  | { t: "scope.sub"; scope: AgScope }
  | { t: "scope.unsub"; scope: AgScope }
  | { t: "doc.sub"; scope: AgScope; doc: string }
  | { t: "doc.unsub"; doc: string }
  | { t: "doc.update"; doc: string; u: string }
  | { t: "doc.awareness"; doc: string; u: string }
  | { t: "op"; scope: AgScope; rid: number; body: AgOp }
  | { t: "ping" };

export type AgServerMsg =
  | {
      t: "scope.snapshot"; scope: string; isGM: boolean; userId: string; members: AgMember[];
      notes: AgNote[]; fields: AgField[]; regions: AgRegion[]; links: AgLink[]; modifiers: AgModifier[];
      actions: AgActionView[]; components: AgComponentDef[]; settings: AgCampaignSettings | null;
    }
  | { t: "scope.denied"; scope: string; reason: string }
  | { t: "upsert"; scope: string; kind: "note"; item: AgNote }
  | { t: "upsert"; scope: string; kind: "field"; item: AgField }
  | { t: "upsert"; scope: string; kind: "region"; item: AgRegion }
  | { t: "upsert"; scope: string; kind: "link"; item: AgLink }
  | { t: "upsert"; scope: string; kind: "modifier"; item: AgModifier }
  | { t: "upsert"; scope: string; kind: "action"; item: AgActionView }
  | { t: "upsert"; scope: string; kind: "component"; item: AgComponentDef }
  | { t: "remove"; scope: string; kind: AgEntityKind; id: string }
  /** Everything one change touched, in one message (applied together, rendered once). */
  | { t: "batch"; scope: string; items: Array<{ kind: AgEntityKind; item?: unknown; id?: string }>; settings?: AgCampaignSettings }
  | { t: "settings"; scope: string; settings: AgCampaignSettings }
  | { t: "doc.sync"; doc: string; u: string; readOnly: boolean }
  | { t: "doc.update"; doc: string; u: string }
  | { t: "doc.awareness"; doc: string; u: string }
  | { t: "doc.revoked"; doc: string }
  | { t: "doc.mode"; doc: string; readOnly: boolean }
  | { t: "doc.denied"; doc: string; reason: string }
  | { t: "op.ack"; rid: number; ok: true; result?: AgOpResult }
  | { t: "op.ack"; rid: number; ok: false; error: string }
  | { t: "pong" };

export type AgEntityKind = "note" | "field" | "region" | "link" | "modifier" | "action" | "component";

export type { AgTokenBar };
