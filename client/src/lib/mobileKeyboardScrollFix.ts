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
 * This module clamps that push while the keyboard is open (the window may
 * only scroll as far as the page's natural scroll range plus the keyboard
 * inset) and snaps the window back into the natural range once the keyboard
 * closes or focus leaves an editable element. Pages that legitimately scroll
 * at the window level are unaffected because the clamp is relative to the
 * document's own scrollable height.
 */
export function installMobileKeyboardScrollFix(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  const isEditable = (el: Element | null): boolean =>
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

  let raf = 0;
  const correct = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const inset = keyboardInset();
      const keyboardOpen = inset > 80 && isEditable(document.activeElement);
      // While typing, allow just enough extra scroll to keep the input above
      // the keyboard; otherwise clamp back to the page's own range.
      const limit = keyboardOpen ? naturalMax() + inset : naturalMax();
      if (window.scrollY > limit) {
        window.scrollTo({ top: limit });
      }
    });
  };

  vv.addEventListener("resize", correct);
  vv.addEventListener("scroll", correct);
  // Keyboard dismissal via "Done"/tap-outside fires focusout before the
  // viewport resize settles — re-check shortly after.
  window.addEventListener(
    "focusout",
    () => {
      window.setTimeout(correct, 100);
      window.setTimeout(correct, 350);
    },
    true,
  );
  window.addEventListener("orientationchange", () =>
    window.setTimeout(correct, 250),
  );
}
