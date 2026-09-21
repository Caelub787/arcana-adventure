// Shared types for the guided in-app tutorial. Kept separate from both the
// engine (TutorialOverlay.tsx) and the content (tutorialSteps.ts) so the
// engine never needs to know what a step is ABOUT, only how to show one.

export interface TutorialStep {
  /** Unique across the whole tour - used for step-level bookkeeping in URLs/logs if ever needed. */
  id: string;
  /** Which TutorialSection this step belongs to - drives the "N of M in <section>" progress and per-section replay in Settings. */
  sectionId: string;
  title: string;
  /** Plain text/short paragraph - rendered as-is, no markdown. */
  body: string;
  /**
   * The data-testid of the real element to spotlight. Omitted for an
   * unanchored step (e.g. the welcome slide) - the card is centered with no
   * scrim cutout.
   */
  targetTestId?: string;
  /**
   * Runs before this step tries to find its target - e.g. open the side
   * panel to the right tab, open a character sheet, switch a sheet's tab.
   * Awaited before the engine starts measuring `targetTestId`. Steps are
   * responsible for driving the app into whatever state makes their own
   * target visible; the engine only measures and highlights.
   */
  onEnter?: () => void | Promise<void>;
  /**
   * If the target never appears (element genuinely absent for this user/
   * device/role - a GM-only button for a player, a conditional tool that
   * isn't showing), the step is skipped automatically after a short wait
   * instead of stalling the tour. Defaults to true; set false only for a
   * step whose target is truly guaranteed to exist whenever this step can
   * be reached at all.
   */
  optional?: boolean;
  /** Preferred side for the card relative to the target; Radix flips it automatically if it doesn't fit. Ignored for unanchored steps. */
  placement?: "top" | "bottom" | "left" | "right";
}

export interface TutorialSection {
  id: string;
  label: string;
  /** Only sections relevant to the current campaign/role/device are shown - filtered by the caller before building steps, not by the engine. */
  steps: TutorialStep[];
}

export interface TutorialSectionProgress {
  id: string;
  label: string;
  done: boolean;
}
