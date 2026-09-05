/**
 * When a click should take a note out of edit mode and back to the rendered
 * view. The note editor has no Done button: clicking into the body starts
 * editing and clicking away ends it, so this decides what "away" means.
 *
 * The subtlety is that nearly everything the editor opens - the reference
 * picker, the formatting menus, the share and delete dialogs, tooltips -
 * renders through a portal at the end of <body>, so it is NOT a descendant of
 * the editor element even though the player is plainly still working on the
 * note. Those have to be treated as inside.
 */

// Radix portals its overlays; each of these marks one. `[data-radix-portal]`
// covers older primitives, the popper wrapper covers popovers/dropdowns/
// selects/tooltips, and the roles catch anything portalled by hand.
export const EDITOR_OVERLAY_SELECTOR =
  '[data-radix-popper-content-wrapper],[data-radix-portal],[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"]';

export function clickEndsNoteEditing(
  target: Element | null | undefined,
  editorEl: Element | null | undefined,
): boolean {
  // No target (or no editor to be outside of) is not a reason to close.
  if (!target || !editorEl) return false;
  if (editorEl.contains(target)) return false;
  if (target.closest(EDITOR_OVERLAY_SELECTOR)) return false;
  return true;
}
