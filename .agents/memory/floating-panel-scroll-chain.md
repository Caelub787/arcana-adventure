---
name: FloatingPanel child height chain
description: A child that sizes itself with flex-1 needs a FLEX parent; under a plain block wrapper it silently grows to full content height and nothing scrolls.
---

# The height chain into a FloatingPanel child must be unbroken

`CharacterSheet` (and anything shaped like it) pins its tab bar and scrolls
only the tab body:

```
CharacterSheet root   flex-1 min-h-0 flex flex-col overflow-hidden
  Tabs                flex-1 min-h-0 flex flex-col overflow-hidden
    TabsList          shrink-0                       ← pinned
    tab body          flex-1 min-h-0 overflow-y-auto ← the intended scroller
```

That only works if **every ancestor up to the panel has a definite height**.
`flex-1` is inert under a `display: block` parent, so one plain wrapper breaks
the whole chain:

```jsx
<div className="flex h-full min-h-0">
  <div className="flex-shrink-0 h-full min-h-0">   {/* block! */}
    <CharacterSheet />                              {/* flex-1 does nothing */}
```

**Symptom:** the scroll wheel does nothing at all, worst on the tallest tab
(C.A./Swampy "Attrs & Skills"). Measured in Chromium on the real class chain:

| element | clientH | scrollH | scrollable |
|---|---|---|---|
| panel content div | 434 | 1329 | "true", but the wheel never scrolls it |
| sheet root | **1329** | 1329 | no — grew to full content height |
| tab body (intended scroller) | 1264 | 1264 | **no — never overflows** |

The sheet root takes its full content height, so the tab body never overflows
and can't scroll. The panel's own `overflow-y-auto` reports a scrollHeight (the
overflow is reachable via `el.scrollTop = n`) but the wheel does not reach it,
because the scroll chain from the element under the cursor terminates at an
unscrollable ancestor. Net effect: **nothing scrolls.**

**Fix:** make the wrapper a flex column — `flex flex-col flex-shrink-0 h-full
min-h-0`. The tab body then becomes the real scroller (369 visible / 1264
content) and the tab bar stays pinned.

**Don't "fix" it by adding `h-full` to the sheet root instead** — the root is
also rendered as a flex item inside the mobile `DialogContent`, where `flex-1`
is what's correct, and the two would fight.

**This does not disturb `fitContent`.** The fit measures the wrapper *before*
reveal, when it has no `h-full` and is auto-height; a flex column's auto height
is still the sum of its children, so the measured natural height is unchanged
(verified: 1329 both ways).

Every other FloatingPanel in `Campaign.tsx` already wraps its child in
`flex flex-col h-full` or `h-full overflow-hidden`. Match that for new ones.
