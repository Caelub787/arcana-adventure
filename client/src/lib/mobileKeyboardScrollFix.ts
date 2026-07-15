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

  // Scroll the field's own container (never the window) so the caret area
  // clears the keyboard. Only moves as much as needed, in either direction.
  const revealInContainer = (el: HTMLElement, container: HTMLElement) => {
    const inset = keyboardInset();
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

  let raf = 0;
  const correct = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const inset = keyboardInset();
      const focused = document.activeElement;
      const keyboardOpen = inset > 80 && isEditable(focused);
      let limit = naturalMax();
      if (keyboardOpen) {
        const container = nearestScrollableAncestor(focused);
        if (container) {
          // Inner-scroll layout: window must not move; reveal within the
          // container instead.
          revealInContainer(focused, container);
        } else {
          // No inner container (e.g. login): allow just enough window
          // scroll to lift the field above the keyboard.
          limit += inset;
        }
      }
      if (window.scrollY > limit) {
        window.scrollTo({ top: limit });
      }
    });
  };

  vv.addEventListener("resize", correct);
  vv.addEventListener("scroll", correct);
  // Focus moving between fields (or keyboard dismissal) settles over a few
  // frames on iOS — re-check shortly after both focus events.
  const later = () => {
    window.setTimeout(correct, 100);
    window.setTimeout(correct, 350);
  };
  window.addEventListener("focusin", later, true);
  window.addEventListener("focusout", later, true);
  window.addEventListener("orientationchange", () =>
    window.setTimeout(correct, 250),
  );
}
