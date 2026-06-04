---
name: AA V3 "Knowledge" label convention
description: In AA V3 the "Custom Skill(s)" feature is shown to users as "Knowledge" — labels only, code keeps customSkill identifiers.
---

In AA V3 campaigns, every user-visible "Custom Skill"/"Custom Skills"
label is rendered as "Knowledge". V2 and other systems keep the original
"Custom Skill(s)" wording.

**Why:** Product decision to rebrand the feature for V3 only. The
underlying schema columns, table names, API paths, component names, and
code identifiers (e.g. `customSkills`, `CharacterCustomSkill`) were
deliberately left unchanged — only display strings differ.

**How to apply:** When adding or editing any V3-rendered UI that surfaces
this feature, gate the label on the system var in scope:
`isAAV3` / `campaignSystem === 'aa-v3'` / `systemSlug === 'aa-v3'`.
Derived label set: Knowledge / Add Knowledge / Edit Knowledge /
No knowledge added yet / Grant Knowledge / Select Knowledge /
Knowledge Name / Knowledge Restriction / Required Knowledge /
Default Knowledge. Also: in the V3 character-sheet Skills tab the Traits
section renders ABOVE the Knowledge section (flex order), opposite of V2.
The hardcoded-aa-v2 ClassNodeEditorDialog keeps "Custom Skill" wording.
