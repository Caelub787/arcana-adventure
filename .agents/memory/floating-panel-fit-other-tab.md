---
name: FloatingPanel fit-to-content sizing to a non-visible tab
description: How to size a fitContent FloatingPanel to a tab other than the one shown at open (character sheet).
---

# Sizing a fitContent panel to a non-active tab

`FloatingPanel`'s `fitContent` measures `contentInnerRef.scrollHeight` — i.e. ONLY
the currently-mounted/active tab's content. Radix `Tabs` unmounts inactive tabs,
so you cannot measure a tab that isn't the active one.

**Rule:** to open a panel sized to tab B while displaying tab A, render tab B as
the active tab first (seed the controlled `activeTab`), let the panel measure +
lock to B, then switch the active tab to A. Do the switch inside the panel's
`onFitLocked` callback — it fires synchronously within `fitToContent` (a
`useLayoutEffect`), right before `setFitRevealed(true)`, so the state update is
flushed before paint and the user never sees tab B (no flash). The panel hides
itself via `waitingForFit`/`fitRevealed` until the lock.

**Why:** the character sheet must open showing Overview but sized to the taller
"Attrs & Skills" (`'attributes'`) tab. A naive `fitContentActive={active==='attributes'}`
gate fails because the sheet opens on Overview, so it never fit until the user
manually visited Attributes (visible late resize). Users explicitly reject the
overview-sized variant.

**How to apply (gotchas):**
- Only seed the measure tab (`'attributes'`) for a NEW panel. If the sheet is
  already open, the fit is already locked and `onFitLocked` won't fire again — so
  honor the requested tab directly instead, or it gets stuck on the measure tab.
- Keep the intended (post-measure) tab per-sheet (a ref keyed by id), not a single
  shared default, so concurrent opens don't cross-couple.
- The 250ms safety reveal timer can unhide before lock under very slow layout; the
  common case locks in the first layout effect well within that window.
- Mobile uses a separate `<Dialog>` (uncontrolled `defaultTab`) and never calls
  `onFitLocked`; don't pass it the controlled `activeTab` or it'll stick on the
  measure tab.
