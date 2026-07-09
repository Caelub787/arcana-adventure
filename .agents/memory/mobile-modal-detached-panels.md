---
name: Mobile modal dialog vs detached panels
description: Why floating/detached panels must render INSIDE the mobile character-sheet Dialog content, not outside it
---

# Rule
On mobile (<768px) the character sheet is a MODAL Radix Dialog. Any interactive panel that must be tappable while that sheet is open has to render inside the DialogContent subtree — never as a detached/Campaign-hosted panel outside it.

**Why:** Radix modal dialogs set `pointer-events: none` on `<body>`; only the dialog content re-enables events. A detached full-screen panel outside the content is visible but untappable — real taps fall through to the dialog/overlay behind it (buttons dead, stray taps dismiss the sheet). Users report this as "glitches / closes the sheet / freezes the screen". Desktop is unaffected because sheets there are non-modal FloatingPanels.

**How to apply:** In the mobile Dialog branch of the character sheet, omit `onOpenItemDetail`/`onOpenSpellbook` so `CharacterSheet` uses its in-sheet fallback panels. The "detached panel survives sheet close" feature is desktop-only by design. When e2e-testing such bugs, note that Playwright synthetic click dispatch bypasses hit-testing and can mask pointer-events interception — a "standard click was intercepted" warning from the tester IS the bug signal.
