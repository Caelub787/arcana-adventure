---
name: AA V3 system naming (display label vs slug)
description: AA V3 uses two different system identifiers depending on the table — getting this wrong silently fails species lookups.
---

# AA V3 system naming: display label vs slug

AA V3 uses TWO different system identifiers depending on the data:

- **Species** are stored/looked up by the **display label `'A.A. V3'`**.
- **Items, classes, feat/skill trees** use the **slug `'aa-v3'`** as their `system` tag.

**Why:** the species table predates the slug convention and keys on the human-readable system name; using the slug `'aa-v3'` to look up species returns nothing and species defaults silently never apply. (Same split exists for V2: label `'A.A. V2'` vs slug `'aa-v2'`.)

**How to apply:** when resolving V3 species server-side, map the campaign `system` slug to the display label first, and match campaign-scoped species by name before falling back to the system lookup.
