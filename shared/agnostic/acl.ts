// Agnostic permission resolution. The SAME functions run on the server (to
// decide what each connection is sent / may write) and on the client (for
// "preview as player" and to know which controls to show), so the preview is
// exactly what that player would receive.
import type { AgAcl, AgAudience, AgAudienceOrInherit, AgField, AgLink, AgNote, AgRegion, AgViewer, AgAction } from "./types";

export function audienceIncludes(aud: AgAudience, viewer: AgViewer, ownerIds: string[]): boolean {
  if (viewer.isGM) return true;
  if (aud === "gm") return false;
  if (aud === "everyone") return true;
  if (aud === "owners") return ownerIds.includes(viewer.userId);
  if (aud.owners && ownerIds.includes(viewer.userId)) return true;
  return aud.users.includes(viewer.userId);
}

const resolve = (a: AgAudienceOrInherit, parent: AgAudience): AgAudience => (a === "inherit" ? parent : a);

/** Resolved audiences of a note's header (name/portrait/existence). */
export function noteHeaderAudiences(note: AgNote): { view: AgAudience; edit: AgAudience } {
  // The header has no parent: "inherit" falls back to the defaults.
  return { view: resolve(note.acl.view, "everyone"), edit: resolve(note.acl.edit, "gm") };
}
export function noteBodyAudiences(note: AgNote): { view: AgAudience; edit: AgAudience } {
  const h = noteHeaderAudiences(note);
  return { view: resolve(note.bodyAcl.view, h.view), edit: resolve(note.bodyAcl.edit, h.edit) };
}

function childAudiences(acl: AgAcl, note: AgNote) {
  const b = noteBodyAudiences(note);
  return { view: resolve(acl.view, b.view), edit: resolve(acl.edit, b.edit) };
}

/**
 * Who counts as an owner when SEEING something (and pressing its buttons): its
 * owners and its users. Changing anything is for owners only.
 */
const seers = (note: AgNote) => (note.userIds?.length ? [...note.ownerIds, ...note.userIds] : note.ownerIds);

/** Templates are GM-authoring material: only the GM ever sees them. */
const templateGuard = (note: AgNote, viewer: AgViewer) => !note.isTemplate || viewer.isGM;

export function canViewNote(note: AgNote, viewer: AgViewer): boolean {
  return templateGuard(note, viewer) && audienceIncludes(noteHeaderAudiences(note).view, viewer, seers(note));
}
export function canEditNoteHeader(note: AgNote, viewer: AgViewer): boolean {
  return canViewNote(note, viewer) && audienceIncludes(noteHeaderAudiences(note).edit, viewer, note.ownerIds);
}
export function canViewBody(note: AgNote, viewer: AgViewer): boolean {
  return canViewNote(note, viewer) && audienceIncludes(noteBodyAudiences(note).view, viewer, seers(note));
}
export function canEditBody(note: AgNote, viewer: AgViewer): boolean {
  return canViewBody(note, viewer) && audienceIncludes(noteBodyAudiences(note).edit, viewer, note.ownerIds);
}

export function canViewField(field: AgField, note: AgNote, viewer: AgViewer): boolean {
  return canViewNote(note, viewer) && audienceIncludes(childAudiences(field.acl, note).view, viewer, seers(note));
}
export function canEditField(field: AgField, note: AgNote, viewer: AgViewer): boolean {
  if (field.type === "formula") return viewer.isGM && canViewField(field, note, viewer); // value is computed
  return canViewField(field, note, viewer) && audienceIncludes(childAudiences(field.acl, note).edit, viewer, note.ownerIds);
}

export function canViewRegion(region: AgRegion, note: AgNote, viewer: AgViewer): boolean {
  return canViewNote(note, viewer) && audienceIncludes(childAudiences(region.acl, note).view, viewer, seers(note));
}
export function canEditRegion(region: AgRegion, note: AgNote, viewer: AgViewer): boolean {
  return canViewRegion(region, note, viewer) && audienceIncludes(childAudiences(region.acl, note).edit, viewer, note.ownerIds);
}

/** Action view = see the button; edit = press it (a sheet's users may press its buttons too). */
export function canSeeAction(action: AgAction, note: AgNote, viewer: AgViewer): boolean {
  return canViewNote(note, viewer) && audienceIncludes(childAudiences(action.acl, note).view, viewer, seers(note));
}
export function canRunAction(action: AgAction, note: AgNote, viewer: AgViewer): boolean {
  return canSeeAction(action, note, viewer) && audienceIncludes(childAudiences(action.acl, note).edit, viewer, seers(note));
}

/** A link is visible when its own audience allows it AND both ends are visible. */
export function canViewLink(link: AgLink, from: AgNote | undefined, to: AgNote | undefined, viewer: AgViewer): boolean {
  if (!from || !to) return false;
  if (!canViewNote(from, viewer) || !canViewNote(to, viewer)) return false;
  return audienceIncludes(resolve(link.acl.view, "everyone"), viewer, [...seers(from), ...seers(to)]);
}

/** Who may change a note's structure (fields/regions/actions/links/permissions). */
export function canDesign(note: AgNote, viewer: AgViewer): boolean {
  return viewer.isGM;
}

export function describeAudience(a: AgAudienceOrInherit, memberName?: (id: string) => string): string {
  if (a === "inherit") return "Same as sheet";
  if (a === "gm") return "GM only";
  if (a === "owners") return "Owners + GM";
  if (a === "everyone") return "Everyone";
  const names = a.users.map((u) => memberName?.(u) ?? "player");
  return [a.owners ? "Owners" : null, ...names].filter(Boolean).join(", ") + " + GM";
}

/**
 * Who plays a sheet: whoever it is assigned to (its owners), and anyone it has
 * been lent to (a player carrying someone else's item). They move its token,
 * change its values and press its buttons. A GM plays everything, so they are
 * never asked — callers check for the GM first.
 */
export function mayPlayNote(note: Pick<AgNote, "ownerIds" | "userIds">, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return note.ownerIds.includes(userId) || !!note.userIds?.includes(userId);
}

export function normalizeAudience(raw: unknown, allowInherit: boolean): AgAudienceOrInherit {
  if (raw === "inherit" && allowInherit) return "inherit";
  if (raw === "gm" || raw === "owners" || raw === "everyone") return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as any).users)) {
    const users = (raw as any).users.filter((u: unknown) => typeof u === "string").slice(0, 100);
    return { owners: !!(raw as any).owners, users };
  }
  return allowInherit ? "inherit" : "gm";
}

export function normalizeAcl(raw: unknown, allowInherit = true, fallback: AgAcl = { view: "inherit", edit: "inherit" }): AgAcl {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const r = raw as any;
  return {
    view: r.view === undefined ? fallback.view : normalizeAudience(r.view, allowInherit),
    edit: r.edit === undefined ? fallback.edit : normalizeAudience(r.edit, allowInherit),
  };
}
