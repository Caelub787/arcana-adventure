---
name: Library scoping semantics
description: How personal "My Library" vs campaign views scope global admin rows
---
Rule: personal mode (My Library, `personal` query flag or /library route) must list ONLY rows owned by the caller — global admin rows (owner/createdByUserId NULL) are excluded. Campaign and non-personal views blend global + owned (+ campaign GM's) rows.

**Why:** User explicitly wants admin content to appear in every campaign but NOT inside anyone's My Library, so random GMs can't confuse/edit admin items while still building their own.

**How to apply:** Storage owner conditions take a `personal` flag: `personal ? inArray(owner, scope) : or(isNull(owner), inArray(owner, scope))`. Any new library list endpoint must parse the `personal` query param (accept both '1' and 'true') and pass it to storage; forgetting it silently leaks global rows into personal lists. The /library client route renders AdminSettings with forcePersonal (don't rely on /admin?personal=1 — that path was flaky).
