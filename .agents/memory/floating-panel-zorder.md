---
name: Floating panel z-order policy
description: Why the shared z-counter panel system must ignore portaled-child events and force-bump on open.
---

The floating panel system shares one module-level z counter with all Radix overlays (selects, popovers, dialogs, tooltips acquire from it on mount so "last opened sits on top").

**Rule 1 — never raise a panel from portaled-child events.** Panel content and any Radix dialog/select declared in its children are portaled to body, but their React events still bubble to the panel's onPointerDown. If the panel raises itself on those, it leapfrogs ABOVE its own open dialog/dropdown ("everything opens behind the panel" — this shipped as a production blocker once). The bring-to-front handler must check `panelRef.current.contains(e.target)` first.

**Rule 2 — force-bump on panel open (mount).** The "skip bump if already topmost" optimization must not apply on mount: a stale registry entry equal to the counter lets a reopened panel reuse an old z and tie with another panel. Both desktop and mobile mount paths pass `force=true`.

**Rule 3 — don't stopPropagation pointerdown on the panel root.** It blocks Radix's document-level outside-press dismissal, leaving popovers stuck open and z-fighting. Cross-panel isolation is done with a native-event handled flag instead.

**Why:** all three were learned from real regressions; the z system looks simple but portals + shared counter interact non-obviously.
**How to apply:** any change to floating-panel.tsx z/pointer logic must re-verify: open panel → dialog inside → select inside dialog stays on top; reopened panels rise above all; clicking a panel closes popovers opened elsewhere.

**Rule 4 — poppers must acquire z at DOM-node mount, not component mount.** A Radix popper wrapper (SelectContent etc.) mounts as a React component as soon as its parent renders — the portal just renders null while closed. A hook acquiring z at component mount grabs a slot BEFORE a containing dialog claims its slots, so the popper opens permanently behind the dialog overlay (clicks intercepted). Use the ref-callback helper (useTopLayerZRef) with a once-per-node dataset guard; the node remounts each open, so each open gets a fresh top slot. Dialog/Sheet use the same node-mount pattern with two slots (overlay strictly below content).

