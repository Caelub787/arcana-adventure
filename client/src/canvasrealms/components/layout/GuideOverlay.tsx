import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAppStore } from "@cr/lib/store";
import { getGuide, type GuideStep } from "@cr/lib/guides";

const HIGHLIGHT_PADDING = 6;
const ARROW_GAP = 14;
const STEP_DISCOVERY_TIMEOUT_MS = 4000;
const STEP_OPTIONAL_TIMEOUT_MS = 350;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function rectsOverlap(
  a: { top: number; left: number; width: number; height: number },
  b: { top: number; left: number; width: number; height: number },
): boolean {
  return !(
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  );
}

function fitsAndDoesNotCover(
  top: number,
  left: number,
  w: number,
  h: number,
  target: { top: number; left: number; width: number; height: number },
  vw: number,
  vh: number,
): boolean {
  if (top < 0 || left < 0) return false;
  if (top + h > vh) return false;
  if (left + w > vw) return false;
  return !rectsOverlap({ top, left, width: w, height: h }, target);
}

// Replace `{key}` placeholders in selector strings with values from params.
// If a placeholder has no matching param value, that selector is dropped
// from the list (rather than producing an invalid `[data-guide="...{}..."]`
// selector that would always fail). The same step is typically marked
// optional so it auto-skips when no substitutable selector remains.
function substituteSelectors(
  selectors: string[],
  params: Record<string, string | undefined>,
): string[] {
  const out: string[] = [];
  for (const sel of selectors) {
    if (!sel.includes("{")) {
      out.push(sel);
      continue;
    }
    let bad = false;
    const replaced = sel.replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = params[key];
      if (!v) {
        bad = true;
        return "";
      }
      return v;
    });
    if (!bad) out.push(replaced);
  }
  return out;
}

function isVisible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return true;
}

function findFirstVisible(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const candidates = Array.from(document.querySelectorAll(sel));
    for (const c of candidates) {
      if (isVisible(c)) return c;
    }
  }
  return null;
}

export function GuideOverlay() {
  const {
    activeGuide,
    cancelGuide,
    advanceGuide,
    guideConfirmation,
    setGuideConfirmation,
  } = useAppStore();
  const guide = activeGuide ? getGuide(activeGuide.guideId) : null;
  const rawStep: GuideStep | null =
    guide && activeGuide ? guide.steps[activeGuide.stepIndex] ?? null : null;
  // Substitute params (e.g. {kindHint}) into the step's selectors so a guide
  // can target submenu items chosen by the AI suggestion. If a placeholder
  // has no value, the templated selector is dropped — combined with
  // optional:true on the step, this lets the step auto-skip cleanly.
  const step: GuideStep | null = rawStep
    ? {
        ...rawStep,
        selectors: substituteSelectors(
          rawStep.selectors,
          activeGuide?.params ?? {},
        ),
      }
    : null;

  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipSize, setTipSize] = useState<{ w: number; h: number } | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const [, setTick] = useState(0);
  const skippedRef = useRef(false);

  // Locate the current step's target element. Polls because UI elements may
  // appear after a click (e.g. a sidebar opening). Skips optional steps that
  // can't be found within a short window.
  useEffect(() => {
    if (!guide || !activeGuide) return;
    const currentRawStep = guide.steps[activeGuide.stepIndex];
    if (!currentRawStep) {
      // All steps done — show confirmation and end.
      setGuideConfirmation(guide.finalCaption ?? "Done.");
      cancelGuide();
      return;
    }
    // Substitute params (e.g. {kindHint}) into selectors so the tick
    // actually polls for the right element. Without this, a templated
    // selector like `[data-guide="new-node-kind-{kindHint}"]` would be
    // queried verbatim and could never match anything.
    const currentSelectors = substituteSelectors(
      currentRawStep.selectors,
      activeGuide.params ?? {},
    );
    setTarget(null);
    setRect(null);
    setTipSize(null);
    skippedRef.current = false;

    // Templated step whose params weren't supplied (e.g. create-node
    // started without a kindHint) — there's nothing to highlight, so
    // resolve immediately rather than dim the screen for the discovery
    // window. Optional steps skip; required steps end gracefully if
    // they're flagged for it, otherwise cancel silently.
    if (currentSelectors.length === 0) {
      if (currentRawStep.optional) {
        skippedRef.current = true;
        advanceGuide();
      } else if (currentRawStep.endGracefullyOnTimeout) {
        setGuideConfirmation(guide.finalCaption ?? "Done.");
        cancelGuide();
      } else {
        cancelGuide();
      }
      return;
    }

    let cancelled = false;
    const start = performance.now();

    const tick = () => {
      if (cancelled) return;
      const found = findFirstVisible(currentSelectors);
      if (found) {
        setTarget(found);
        setRect(found.getBoundingClientRect());
        return;
      }
      const elapsed = performance.now() - start;
      const limit = currentRawStep.optional
        ? STEP_OPTIONAL_TIMEOUT_MS
        : STEP_DISCOVERY_TIMEOUT_MS;
      if (elapsed > limit) {
        if (currentRawStep.optional && !skippedRef.current) {
          skippedRef.current = true;
          advanceGuide();
          return;
        }
        if (currentRawStep.endGracefullyOnTimeout) {
          // Target never appeared — end the guide with its
          // confirmation toast rather than leaving the dim overlay up.
          // The user already saw the previous step; failing closed is
          // fine for this guide.
          setGuideConfirmation(guide.finalCaption ?? "Done.");
        }
        cancelGuide();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [guide, activeGuide, advanceGuide, cancelGuide, setGuideConfirmation]);

  // Keep the highlight rect in sync with scroll/resize/layout shifts.
  useLayoutEffect(() => {
    if (!target) return;
    const update = () => {
      setRect(target.getBoundingClientRect());
      setTick((t) => t + 1);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const ro = new ResizeObserver(update);
    ro.observe(target);
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro.disconnect();
      mo.disconnect();
    };
  }, [target]);

  // Escape always cancels the active guide, even before a target is found.
  useEffect(() => {
    if (!activeGuide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelGuide();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeGuide, cancelGuide]);

  // Click handling: clicking the highlighted element (or inside its soft
  // padding) advances; clicking clearly outside cancels. Armed after a short
  // delay so the same click that started the guide (e.g. tapping "Show me"
  // in Compass) doesn't immediately cancel it via a stray bubbled event.
  //
  // We listen on `click` (not `mousedown`) at the capture phase so:
  //   1. The browser has already chosen the click target and the target
  //      element's own onClick will fire during this same dispatch's bubble
  //      phase. Advancing the guide schedules a React re-render that only
  //      commits after the dispatch ends, so the target isn't unmounted /
  //      replaced before its handler runs.
  //   2. Calling preventDefault/stopPropagation only on off-target clicks
  //      consumes the bogus click without blocking the real one. The
  //      on-target click is left untouched so it bubbles normally to the
  //      button (open library, open menu, create realm…).
  //
  // The hit test uses the padded highlight rectangle (in viewport
  // coordinates) as the source of truth, NOT `target.contains(eventTarget)`.
  // Reason: overlays sitting above the page — the tail end of a closing
  // Compass panel, a portal'd dropdown, even our own dim panels along the
  // cutout edge — can become the click target while the user is visually
  // tapping the highlighted button. Trusting `target.contains` in those
  // cases would mark a perfectly on-target tap as off-target and cancel
  // the guide. The padded rectangle is what the user actually sees glowing,
  // so that's what we match against.
  //
  // Note: deliberately depend only on `target` (not `rect`). The hit test
  // reads `target.getBoundingClientRect()` live, so it stays accurate as
  // layout shifts. Depending on `rect` would tear this listener down on
  // every ResizeObserver/MutationObserver tick and reset the arm timer,
  // causing intermittently-ignored clicks on busy layouts.
  useEffect(() => {
    if (!target) return;
    let armed = false;
    // Slightly longer than the launching surface's typical close
    // animation (Compass: 200ms) plus a frame buffer, so a tap that comes
    // immediately after the highlight appears is never processed against a
    // stale layout.
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 250);

    const inPaddedRect = (x: number, y: number) => {
      const r = target.getBoundingClientRect();
      return (
        x >= r.left - HIGHLIGHT_PADDING &&
        x <= r.right + HIGHLIGHT_PADDING &&
        y >= r.top - HIGHLIGHT_PADDING &&
        y <= r.bottom + HIGHLIGHT_PADDING
      );
    };

    const onClick = (e: MouseEvent) => {
      if (!armed) return;
      const t = e.target as Node | null;
      const inPadded = inPaddedRect(e.clientX, e.clientY);
      const onTarget = !!t && target.contains(t);

      if (inPadded) {
        if (onTarget) {
          // The click reached the highlighted element naturally. Don't
          // touch the event — let it bubble so the button's own onClick
          // fires (open library, open menu, create realm…). Schedule the
          // advance for after dispatch so React's re-render doesn't
          // unmount the target before its handler runs.
          queueMicrotask(() => advanceGuide());
          return;
        }
        // Coordinates are inside the visible highlight, but some overlay
        // sitting above the page caught the click instead of the target.
        // Consume the original event so the overlay doesn't react, then
        // forward the click to the actual target so its action still
        // fires. Finally, advance the guide.
        e.preventDefault();
        e.stopPropagation();
        try {
          target.click();
        } catch {
          target.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
        }
        queueMicrotask(() => advanceGuide());
        return;
      }
      // Clearly off-target — cancel and consume the event so the user
      // doesn't accidentally trigger something while dismissing.
      e.preventDefault();
      e.stopPropagation();
      cancelGuide();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("click", onClick, true);
    };
  }, [target, advanceGuide, cancelGuide]);

  // While a guide is active, hide the rest of the app from screen readers so
  // assistive tech doesn't wander into the dimmed UI. We intentionally do
  // NOT set the `inert` attribute here: inert suppresses the synthetic
  // `click` event on the highlighted target (the document-level capture
  // mousedown listener still fires and advances the guide, but the button's
  // own onClick never runs, so menus never open). The dim panels already
  // catch off-target pointer events geometrically.
  useEffect(() => {
    if (!activeGuide) return;
    const root = document.getElementById("root") ?? document.querySelector("main");
    if (!root) return;
    const prevAriaHidden = root.getAttribute("aria-hidden");
    root.setAttribute("aria-hidden", "true");
    return () => {
      if (prevAriaHidden === null) root.removeAttribute("aria-hidden");
      else root.setAttribute("aria-hidden", prevAriaHidden);
    };
  }, [activeGuide]);

  // Auto-dismiss the post-guide confirmation toast.
  useEffect(() => {
    if (!guideConfirmation) return;
    const t = window.setTimeout(() => setGuideConfirmation(null), 2400);
    return () => window.clearTimeout(t);
  }, [guideConfirmation, setGuideConfirmation]);

  if (typeof document === "undefined") return null;

  // Only mount confirmation toast when no guide is active.
  if (!guide || !activeGuide || !step) {
    if (guideConfirmation) {
      return createPortal(
        <div className="fixed inset-x-0 bottom-6 z-[1000] flex justify-center pointer-events-none">
          <div className="rounded-full bg-foreground text-background text-xs px-4 py-2 shadow-lg">
            {guideConfirmation}
          </div>
        </div>,
        document.body,
      );
    }
    return null;
  }

  // While discovering the target, dim with no cutout.
  if (!target || !rect) {
    return createPortal(
      <div className="fixed inset-0 z-[999] bg-black/55 backdrop-blur-[1px] pointer-events-auto" />,
      document.body,
    );
  }

  const padded = {
    top: rect.top - HIGHLIGHT_PADDING,
    left: rect.left - HIGHLIGHT_PADDING,
    width: rect.width + HIGHLIGHT_PADDING * 2,
    height: rect.height + HIGHLIGHT_PADDING * 2,
  };

  // Caption sizing. Width is responsive to viewport so it never overflows
  // narrow phones; height is measured from the actual rendered tooltip
  // (longer captions wrap to >2 lines on small widths) so the
  // fitsAndDoesNotCover() placement check stays accurate.
  const MARGIN = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TIP_W = Math.min(280, Math.max(220, vw - MARGIN * 2));
  const TIP_H = tipSize?.h ?? 96;

  // Try the four cardinal sides around the highlight in order of preference
  // and pick the first one whose rect fully fits in the viewport without
  // covering the highlighted target. This stops the caption from blocking
  // the very button the user is supposed to tap.
  type Side = "below" | "above" | "right" | "left";
  const candidates: Array<{ side: Side; top: number; left: number }> = [
    {
      side: "below",
      top: padded.top + padded.height + ARROW_GAP,
      left: clamp(
        padded.left + padded.width / 2 - TIP_W / 2,
        MARGIN,
        vw - TIP_W - MARGIN,
      ),
    },
    {
      side: "above",
      top: padded.top - ARROW_GAP - TIP_H,
      left: clamp(
        padded.left + padded.width / 2 - TIP_W / 2,
        MARGIN,
        vw - TIP_W - MARGIN,
      ),
    },
    {
      side: "right",
      top: clamp(
        padded.top + padded.height / 2 - TIP_H / 2,
        MARGIN,
        vh - TIP_H - MARGIN,
      ),
      left: padded.left + padded.width + ARROW_GAP,
    },
    {
      side: "left",
      top: clamp(
        padded.top + padded.height / 2 - TIP_H / 2,
        MARGIN,
        vh - TIP_H - MARGIN,
      ),
      left: padded.left - ARROW_GAP - TIP_W,
    },
  ];

  const chosen =
    candidates.find((c) =>
      fitsAndDoesNotCover(c.top, c.left, TIP_W, TIP_H, padded, vw, vh),
    ) ??
    // Last-resort fallback: clamp the "below" position into the viewport
    // even if it overlaps. Better to be slightly off than off-screen.
    {
      side: "below" as Side,
      top: clamp(
        padded.top + padded.height + ARROW_GAP,
        MARGIN,
        vh - TIP_H - MARGIN,
      ),
      left: clamp(
        padded.left + padded.width / 2 - TIP_W / 2,
        MARGIN,
        vw - TIP_W - MARGIN,
      ),
    };

  const arrowChar: string =
    chosen.side === "below"
      ? "↑"
      : chosen.side === "above"
        ? "↓"
        : chosen.side === "right"
          ? "←"
          : "→";
  const captionStyle: React.CSSProperties = {
    top: chosen.top,
    left: chosen.left,
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] pointer-events-none">
      {/* Four dim panels around the highlight cutout — leaves the target
          clickable through the gap. */}
      <div
        className="absolute bg-black/65 pointer-events-auto"
        style={{ top: 0, left: 0, right: 0, height: padded.top }}
      />
      <div
        className="absolute bg-black/65 pointer-events-auto"
        style={{
          top: padded.top + padded.height,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <div
        className="absolute bg-black/65 pointer-events-auto"
        style={{
          top: padded.top,
          left: 0,
          width: padded.left,
          height: padded.height,
        }}
      />
      <div
        className="absolute bg-black/65 pointer-events-auto"
        style={{
          top: padded.top,
          left: padded.left + padded.width,
          right: 0,
          height: padded.height,
        }}
      />

      {/* Glowing ring around the target. */}
      <div
        className="absolute rounded-md pointer-events-none ring-2 ring-accent shadow-[0_0_0_4px_rgba(124,92,255,0.35)]"
        style={{
          top: padded.top,
          left: padded.left,
          width: padded.width,
          height: padded.height,
        }}
      />

      {/* Caption + arrow. */}
      <div
        ref={(el) => {
          captionRef.current = el;
          if (el) {
            const h = Math.ceil(el.getBoundingClientRect().height);
            const w = Math.ceil(el.getBoundingClientRect().width);
            if (!tipSize || tipSize.h !== h || tipSize.w !== w) {
              // Defer to next frame so we don't setState during render.
              requestAnimationFrame(() => setTipSize({ w, h }));
            }
          }
        }}
        className="absolute pointer-events-auto rounded-lg bg-popover text-popover-foreground border border-border shadow-2xl px-3 py-2.5 text-sm"
        style={{ ...captionStyle, width: TIP_W }}
      >
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-accent text-base leading-5">
            {arrowChar}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[13px] leading-snug">{step.caption}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {guide.title} · step {activeGuide.stepIndex + 1} of {guide.steps.length}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel guide"
            onClick={cancelGuide}
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 p-1 rounded hover:bg-accent/20"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
