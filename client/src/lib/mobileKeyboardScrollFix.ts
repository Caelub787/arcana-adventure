/**
 * iOS / mobile-webview keyboard scroll fix.
 *
 * When the on-screen keyboard opens, WebKit scrolls the WINDOW to bring the
 * focused input into view. On this app's full-screen layouts
 * (`h-screen overflow-hidden`, centered login card, etc.) the window has
 * nothing to scroll, so the whole UI gets pushed up out of frame — and it
 * often stays shifted after the keyboard closes. Users see the content they
 * are typing "fall out of the screen".
 *
 * Strategy:
 *  - If the focused field lives inside an inner scrollable container (most
 *    of the app: Canvas Realms, campaign panels, dialogs), the WINDOW is not
 *    allowed to overscroll at all — instead we reveal the field by scrolling
 *    its own container just enough to clear the keyboard.
 *  - If there is no inner scrollable container (e.g. the login card), the
 *    window may scroll at most the keyboard inset, and snaps back once the
 *    keyboard closes or focus leaves an editable element.
 *  - Pages that legitimately scroll at the window level are unaffected
 *    because all clamps are relative to the document's own scroll range.
 */
export function installMobileKeyboardScrollFix(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  const isEditable = (el: Element | null): el is HTMLElement =>
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable);

  // How far the page can scroll on its own (0 for fixed full-screen layouts).
  const naturalMax = (): number =>
    Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );

  // Height eaten by the keyboard (0 when closed).
  const keyboardInset = (): number =>
    Math.max(0, window.innerHeight - vv.height);

  const isScrollable = (el: HTMLElement): boolean => {
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    const oy = window.getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll" || oy === "overlay";
  };

  const nearestScrollableAncestor = (el: HTMLElement): HTMLElement | null => {
    let p: HTMLElement | null = el.parentElement;
    while (p) {
      if (isScrollable(p)) return p;
      p = p.parentElement;
    }
    return null;
  };

  // Last non-zero keyboard height we have observed. Used to PRE-reveal a
  // field at focus time, before the keyboard/viewport has resized — on iOS
  // the pan that hides content is done by the compositor and is NOT
  // reported as a window scroll, so it cannot be undone after the fact.
  // The only reliable cure is to make sure the field is already visible
  // above where the keyboard will be, so WebKit never pans at all.
  let lastKnownInset = 260;

  // Scroll the field's own container (never the window) so the caret area
  // clears the keyboard. Only moves as much as needed, in either direction.
  const revealInContainer = (
    el: HTMLElement,
    container: HTMLElement,
    insetOverride?: number,
  ) => {
    const inset = insetOverride ?? keyboardInset();
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    // Bottom edge of the visible (non-keyboard) area in client coords.
    const visibleBottom =
      Math.min(window.innerHeight - inset, c.bottom) - 12;
    const visibleTop = Math.max(0, c.top) + 12;
    if (r.bottom > visibleBottom) {
      container.scrollTop += Math.min(
        r.bottom - visibleBottom,
        // Never scroll the field's top edge past the top of view.
        Math.max(0, r.top - visibleTop),
      );
    } else if (r.top < visibleTop) {
      container.scrollTop -= visibleTop - r.top;
    }
  };

  // Core clamp. IMPORTANT: while the keyboard is OPEN we must never fight
  // iOS's own caret-reveal pans — WebKit re-pans on every keystroke, and a
  // scroll tug-of-war paints a black flash per letter (seen in admin
  // dialogs). So with the keyboard open the window may move up to the
  // keyboard inset, full stop. The clamp's real job is the snap-BACK: once
  // the keyboard closes (or focus leaves), pull the window back into the
  // page's natural range so the UI never stays shoved out of frame.
  const clampNow = () => {
    const inset = keyboardInset();
    if (inset > 80) lastKnownInset = inset;
    const keyboardOpen = inset > 80 && isEditable(document.activeElement);
    const limit = keyboardOpen ? naturalMax() + inset : naturalMax();
    if (window.scrollY > limit) {
      window.scrollTo(0, limit);
    }
  };

  let raf = 0;
  const correct = () => {
    clampNow();
    // Re-check next frame too: iOS often applies its scroll adjustment
    // after the event that announced it.
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(clampNow);
  };

  vv.addEventListener("resize", correct);
  vv.addEventListener("scroll", correct);
  // Any window scroll while a full-screen (non-window-scrolling) layout is
  // active gets clamped immediately — this is what kills the black flash.
  window.addEventListener("scroll", clampNow, { passive: true });
  // Focus moving between fields (or keyboard dismissal) settles over a few
  // frames on iOS — re-check shortly after both focus events.
  const later = () => {
    window.setTimeout(correct, 100);
    window.setTimeout(correct, 350);
  };
  // PRE-REVEAL: the moment an editable gains focus, synchronously scroll
  // its inner container so the field already sits above where the keyboard
  // will be (using the last known keyboard height when the viewport hasn't
  // resized yet). This runs before WebKit computes its compositor pan, so
  // there is nothing left for it to pan — which is the only way to stop
  // the black flash, since that pan is invisible to window.scrollY.
  window.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      // Only pre-reveal on touch devices — desktop has no on-screen
      // keyboard, so assuming one would scroll containers for no reason.
      const isTouch =
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches;
      if (isTouch && isEditable(t as Element | null)) {
        const el = t as HTMLElement;
        const container = nearestScrollableAncestor(el);
        if (container) {
          const inset = Math.max(keyboardInset(), lastKnownInset);
          revealInContainer(el, container, inset);
        }
      }
      later();
    },
    true,
  );
  window.addEventListener("focusout", later, true);
  window.addEventListener("orientationchange", () =>
    window.setTimeout(correct, 250),
  );
}
