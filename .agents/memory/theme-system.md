---
name: App theme system architecture
description: How the 3-theme system works given literal Tailwind stone/amber classes and dual Tailwind builds
---

The app has three themes ("cartographers-study" default, "arcane-library", "sagebound-workshop") driven by `<html data-theme>` + `users.theme` + localStorage key `aa-theme`.

**Key constraint:** the UI uses literal Tailwind `stone-*`/`amber-*` classes everywhere (~6000 uses), so theming is done by remapping `--color-stone-N`/`--color-amber-N` inside `@theme inline` to `--t-stone-N`/`--t-amber-N` CSS vars, then overriding those vars under `:root[data-theme=...]`.

**Why the remap must exist in BOTH css files:** `client/src/index.css` and `client/src/canvasrealms/index.css` each run their own Tailwind build in the same bundle. If only one remaps, the other emits static oklch stone utilities that can win by load order and break theming. Any new Tailwind entry CSS file must repeat the remap.

**How to apply:**
- Per-theme palette blocks live in `client/src/index.css` (`--t-*` ramps + shadcn hsl triplets); Canvas Realms gets its own triplet overrides (incl. sidebar vars) with `:root[data-theme=t], :root[data-theme=t] .dark` so `(0,2,0)` specificity beats the `.dark` blocks.
- Section accents use `[data-section=campaign|notes|canvas-realms|admin]` vars (`--section-accent/hover/muted/glow`) with per-theme override selectors.
- No-flash: inline script in `client/index.html` head sets `data-theme` pre-render; AuthContext applies `user.theme` on load (server wins over local).
- The shadcn triplet var names (`--background` etc.) are hsl triplets — never assign hex to them; theme-specific hex tokens use `--theme-*` names instead.
