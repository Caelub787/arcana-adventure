---
name: CR sidebar stacking context traps popover hit-testing
description: Why in-sidebar popovers in Canvas Realms must be portaled to document.body
---

**Rule:** Any popover/menu rendered inside a Canvas Realms docked sidebar that can extend past the sidebar's edge must be rendered via `createPortal(document.body)` with fixed positioning — z-index alone can never fix its hit-testing.

**Why:** The CR sidebar wrappers use `backdrop-blur-*` (backdrop-filter creates a stacking context), and `<main>` / the opposite sidebar are later positioned siblings. Any child z-index is trapped inside the sidebar's stacking context, so the overhanging part of a menu loses paint/hit-testing to the canvas pane no matter how high its z. Symptom seen live: node-type picker clicks near/past the sidebar's right edge were swallowed (first by the resize handle at equal z, then by the canvas pane after the z bump).

**How to apply:** Portal the popover to body, anchor with a rect captured on open (`getBoundingClientRect`), clamp to viewport, and make the outside-click handler check both the trigger ref and the portal ref (portaled DOM is no longer inside the trigger wrapper). Also: `SidebarResizeHandle` has a `disabled` prop (pointer-events-none) for suppressing the resize strip while an overlay is open.

**Mobile addendum:** On mobile the CR Library is a Vaul modal drawer, which sets `body { pointer-events: none }` while open. Any menu portaled to document.body must carry its own `pointer-events-auto` or every tap on it is dead (symptom: "+ New" / node-type picker opens but can't add nodes on mobile).
