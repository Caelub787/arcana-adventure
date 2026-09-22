// The guided tutorial's rendering engine. Knows nothing about what a step is
// ABOUT (see tutorialSteps.ts for that) - only how to dim the screen, punch a
// spotlight hole around a real element found by its data-testid, and show a
// card describing it, on any viewport this app runs on (phone, folding
// phone, tablet, laptop) without hardcoding a single breakpoint.
//
// Two different kinds of "keep this accurate" are at work here, both
// necessary because a step's target can move for reasons that have nothing
// to do with the window itself: a panel sliding open, a tab switching, a
// FloatingPanel being dragged.
//   1. The spotlight ring and scrim cutout are OUR OWN rectangles, recomputed
//      every animation frame from the target element's live
//      getBoundingClientRect() via useTargetRect below.
//   2. The description card's position is handed to Radix Popper via a
//      "virtual anchor" (an object with just a getBoundingClientRect method,
//      no real DOM node) and `updatePositionStrategy="always"`, which makes
//      Radix re-measure and reflow every animation frame too, including
//      flipping to whichever side actually fits - so the card never has to
//      guess "am I near the phone's screen edge" itself.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopLayerOverlay, useTopLayerZRef } from "@/components/ui/floating-panel";
import { LoadingLogo } from "@/components/LoadingLogo";
import type { TutorialSection, TutorialStep } from "./tutorialTypes";

const SPOTLIGHT_PADDING = 6;

interface Measurable {
  getBoundingClientRect(): DOMRect;
}

const EMPTY_RECT = new DOMRect(-9999, -9999, 0, 0);

/** Tracks a step's target element's live rect for as long as the step is
 * mounted. `notFound` flips true only once the target has had `timeoutMs` to
 * appear at all - by the time a TutorialOverlay is mounted for a step, its
 * onEnter (and the settle wait after it - see TutorialRunner) have already
 * run, so this timeout is purely "this element genuinely doesn't exist for
 * this user/device/role," not "it hasn't opened yet." */
function useTargetRect(testId: string | undefined, timeoutMs = 600) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [notFound, setNotFound] = useState(false);
  const rectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    if (!testId) {
      setNotFound(false);
      return;
    }
    let cancelled = false;
    let rafId = 0;
    let ro: ResizeObserver | null = null;
    let trackedEl: Element | null = null;
    const startedAt = performance.now();
    let selector: string;
    try {
      selector = `[data-testid="${CSS.escape(testId)}"]`;
    } catch {
      selector = "";
    }

    const applyRect = (next: DOMRect) => {
      rectRef.current = next;
      setRect((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };

    const tick = () => {
      if (cancelled) return;
      const el = selector ? document.querySelector(selector) : null;
      if (el) {
        if (el !== trackedEl) {
          trackedEl = el;
          ro?.disconnect();
          ro = new ResizeObserver(() => {
            if (trackedEl) applyRect(trackedEl.getBoundingClientRect());
          });
          ro.observe(el);
        }
        applyRect(el.getBoundingClientRect());
      } else if (performance.now() - startedAt > timeoutMs) {
        setNotFound(true);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [testId, timeoutMs]);

  return { rect, notFound, rectRef };
}

interface TutorialOverlayProps {
  step: TutorialStep;
  stepIndexInSection: number;
  stepCountInSection: number;
  sectionLabel: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onClose: () => void;
  canGoBack: boolean;
  isLastStep: boolean;
  /** Fires once if this step's target never appears - the caller should treat it like Next. */
  onTargetMissing: () => void;
}

function TutorialOverlay({
  step,
  stepIndexInSection,
  stepCountInSection,
  sectionLabel,
  onNext,
  onBack,
  onSkip,
  onClose,
  canGoBack,
  isLastStep,
  onTargetMissing,
}: TutorialOverlayProps) {
  const { rect, notFound, rectRef } = useTargetRect(step.targetTestId);

  // Guards against firing more than once per step: notFound stays true once
  // set, and onTargetMissing (the parent's advance()) isn't guaranteed to be
  // referentially stable, so without this a later, unrelated re-render here
  // would call it again and skip extra steps.
  const missingFiredRef = useRef(false);
  useEffect(() => {
    missingFiredRef.current = false;
  }, [step.id]);
  useEffect(() => {
    if (notFound && step.optional !== false && !missingFiredRef.current) {
      missingFiredRef.current = true;
      onTargetMissing();
    }
  }, [notFound, step.optional, onTargetMissing]);

  const anchorRef = useRef<Measurable>({
    getBoundingClientRect: () => rectRef.current ?? EMPTY_RECT,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasTarget = !!step.targetTestId;
  const showSpotlight = hasTarget && !!rect && !notFound;

  const frame = useMemo(() => {
    if (!showSpotlight || !rect) return null;
    const pad = SPOTLIGHT_PADDING;
    return {
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      right: rect.right + pad,
      bottom: rect.bottom + pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
  }, [showSpotlight, rect]);

  const contentRef = useTopLayerZRef<HTMLDivElement>(null);

  const cardBody = (
    <>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
          {sectionLabel} · {stepIndexInSection + 1} of {stepCountInSection}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 hover:opacity-70"
          style={{ color: "hsl(var(--muted-foreground))" }}
          title="Close tutorial"
          data-testid="button-tutorial-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <h3 className="text-sm font-bold mb-1" data-testid="text-tutorial-title">
        {step.title}
      </h3>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "hsl(var(--popover-foreground) / 0.85)" }} data-testid="text-tutorial-body">
        {step.body}
      </p>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onSkip} data-testid="button-tutorial-skip">
          Skip tutorial
        </Button>
        <div className="flex items-center gap-1">
          {canGoBack && (
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={onBack} title="Back" data-testid="button-tutorial-back">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs px-3" onClick={onNext} data-testid="button-tutorial-next">
            {isLastStep ? "Finish" : "Next"}
            {!isLastStep && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
          </Button>
        </div>
      </div>
    </>
  );

  const cardClassName = "w-[min(340px,calc(100vw-32px))] rounded-lg border p-4 shadow-2xl outline-none";
  const cardColorStyle: CSSProperties = {
    background: "hsl(var(--popover))",
    borderColor: "var(--button-outline)",
    color: "hsl(var(--popover-foreground))",
  };

  return (
    <TopLayerOverlay className="fixed inset-0" style={{ pointerEvents: "auto" }} data-testid="tutorial-overlay">
      {/* Scrim: either one full-bleed dim (no target, or still waiting for
          one that turned out not to exist) or four bands framing the
          spotlight hole, so nothing is ever drawn on top of the thing being
          pointed at. */}
      {frame ? (
        <>
          <div className="fixed bg-black/70" style={{ top: 0, left: 0, right: 0, height: frame.top }} />
          <div className="fixed bg-black/70" style={{ top: frame.bottom, left: 0, right: 0, bottom: 0 }} />
          <div className="fixed bg-black/70" style={{ top: frame.top, left: 0, width: frame.left, height: frame.height }} />
          <div className="fixed bg-black/70" style={{ top: frame.top, left: frame.right, right: 0, height: frame.height }} />
          <div
            className="fixed rounded-lg tutorial-spotlight-ring pointer-events-none"
            style={{ top: frame.top, left: frame.left, width: frame.width, height: frame.height }}
            data-testid="tutorial-spotlight-ring"
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/70" />
      )}

      {hasTarget && rect ? (
        <PopoverPrimitive.Root open>
          <PopoverPrimitive.Anchor virtualRef={anchorRef} />
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              ref={contentRef}
              side={step.placement ?? "bottom"}
              align="center"
              sideOffset={16}
              collisionPadding={16}
              updatePositionStrategy="always"
              className={cardClassName}
              style={cardColorStyle}
              data-testid="tutorial-card"
            >
              {cardBody}
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      ) : (
        // No Radix Popper here: either this step has no target at all (a
        // welcome/overview-style step), or it has one but we don't have its
        // rect YET (still measuring, or it turned out not to exist and
        // we're about to be skipped past). Either way, a plain centered
        // card - never nothing - so there's no blank-looking pause while
        // useTargetRect works out which case this is.
        <div
          ref={contentRef}
          className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${cardClassName}`}
          style={cardColorStyle}
          data-testid="tutorial-card"
        >
          {cardBody}
        </div>
      )}
    </TopLayerOverlay>
  );
}

// Shown only once a step transition has taken long enough to be worth
// surfacing at all (see `showLoading` in TutorialRunner) - a dim scrim with
// a spinner, no card, since the next step's content isn't ready to show yet.
function TutorialLoadingOverlay() {
  return (
    <TopLayerOverlay className="fixed inset-0 flex items-center justify-center" style={{ pointerEvents: "auto" }} data-testid="tutorial-overlay-loading">
      <div className="fixed inset-0 bg-black/70" />
      <LoadingLogo className="h-8 w-8 relative" />
    </TopLayerOverlay>
  );
}

export interface TutorialRunnerProps {
  sections: TutorialSection[];
  /** Fires once, when the last step's Next/Finish is pressed. */
  onFinish: () => void;
  /** Fires once, on Skip or the X - whatever section progress was already reached still gets onSectionComplete calls first. */
  onSkip: () => void;
  /** Fires the moment a section's last step is passed (by Next, or by an optional step's target going missing) - never fires for a section abandoned mid-way by Skip/X. */
  onSectionComplete: (sectionId: string) => void;
}

/**
 * Orchestrates the flattened step list: runs each step's onEnter, then waits
 * two animation frames before showing the overlay for that step. The wait
 * matters for z-stacking, not just visual smoothness - if onEnter opened a
 * FloatingPanel (e.g. a character sheet), that panel claims its own
 * top-of-stack z-index the moment it mounts. TutorialOverlay is remounted
 * fresh per step (key={step.id}) and claims ITS top-of-stack slot only once
 * it actually renders - waiting for the panel to finish mounting first is
 * what guarantees the tutorial always ends up drawn above whatever it just
 * opened, rather than a race that could go either way.
 */
export function TutorialRunner({ sections, onFinish, onSkip, onSectionComplete }: TutorialRunnerProps) {
  const steps = useMemo(() => sections.flatMap((s) => s.steps), [sections]);
  const sectionByStepIndex = useMemo(() => steps.map((s) => s.sectionId), [steps]);
  const lastIndexOfSection = useMemo(() => {
    const map = new Map<string, number>();
    steps.forEach((s, i) => map.set(s.sectionId, i));
    return map;
  }, [steps]);
  const sectionMeta = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const section of sections) map.set(section.id, { label: section.label, count: section.steps.length });
    return map;
  }, [sections]);

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  // Most step transitions settle in well under 100ms (just the two rAFs
  // below) - showing a spinner for that would just be a flicker. Only a step
  // whose onEnter does real async work (creating a throwaway demo character,
  // say) takes long enough to be worth surfacing at all.
  const [showLoading, setShowLoading] = useState(false);
  const step = steps[index];

  useEffect(() => {
    if (ready) {
      setShowLoading(false);
      return;
    }
    const t = setTimeout(() => setShowLoading(true), 150);
    return () => clearTimeout(t);
  }, [ready, step?.id]);

  const finishCurrentSectionIfLast = useCallback(
    (i: number) => {
      const sectionId = sectionByStepIndex[i];
      if (lastIndexOfSection.get(sectionId) === i) onSectionComplete(sectionId);
    },
    [sectionByStepIndex, lastIndexOfSection, onSectionComplete],
  );

  const advance = useCallback(() => {
    finishCurrentSectionIfLast(index);
    if (index + 1 >= steps.length) {
      onFinish();
    } else {
      setIndex(index + 1);
    }
  }, [index, finishCurrentSectionIfLast, steps.length, onFinish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      if (step?.onEnter) {
        await step.onEnter();
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (cancelled) return;
      // A step whose target is ALREADY absent (a GM-only or conditional
      // button that just isn't there for this user/device) skips right
      // here, before ever painting - the alternative was showing a bare dim
      // screen for the full useTargetRect timeout while it waited to
      // confirm the obvious. A target that's genuinely just slow to mount
      // still gets caught by that timeout (see TutorialOverlay).
      if (step?.targetTestId && step.optional !== false) {
        let selector = "";
        try {
          selector = `[data-testid="${CSS.escape(step.targetTestId)}"]`;
        } catch {
          // ignore - fall through to setReady, useTargetRect will sort it out
        }
        if (selector && !document.querySelector(selector)) {
          advance();
          return;
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately just step?.id: onEnter/optional/targetTestId are all
    // properties of that same step object, and advance is stable enough
    // within one step (it only changes with `index`, which changing IS a
    // step change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  if (!steps.length || !step) return null;
  if (!ready) return showLoading ? <TutorialLoadingOverlay /> : null;

  const stepIndexInSection = steps.slice(0, index + 1).filter((s) => s.sectionId === step.sectionId).length - 1;
  const meta = sectionMeta.get(step.sectionId);

  return (
    <TutorialOverlay
      key={step.id}
      step={step}
      stepIndexInSection={stepIndexInSection}
      stepCountInSection={meta?.count ?? 1}
      sectionLabel={meta?.label ?? ""}
      onNext={advance}
      onBack={back}
      onSkip={onSkip}
      onClose={onSkip}
      canGoBack={index > 0}
      isLastStep={index === steps.length - 1}
      onTargetMissing={advance}
    />
  );
}
