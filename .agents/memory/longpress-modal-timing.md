---
name: Long-press must not open modals mid-touch
description: Why long-press gestures must arm at the threshold and open the modal on pointer release, not while the finger is still down
---

# Rule
A long-press gesture that opens a modal (Radix Dialog) must NOT open it the moment the hold timer fires while the pointer is still down. Instead: the timer only ARMS the action (store the open callback in a ref); `pointerup` executes it; `pointerleave`/`pointercancel` cancel it.

**Why:** Opening a modal mid-touch sets `pointer-events: none` on `<body>` during the active gesture. The touch release then fires synthetic mouse/click events into a changed layout — the dialog is instantly dismissed or the gesture state wedges. Users report this as "long-press freezes the app / does nothing." Desktop mouse often works fine, which masks the bug in e2e; it only breaks on real touch.

**How to apply:** Any new long-press-to-open-dialog interaction: timer sets a pending-open ref, open on release. Also add `WebkitTouchCallout: 'none'` (plus `select-none`, `draggable={false}`, contextmenu preventDefault) on the press target to suppress iOS image callout. Handle `onPointerCancel`, not just up/leave.
