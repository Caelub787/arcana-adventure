// The small "want a tour?" card shown once per campaign, bottom-left, the
// first time a member opens it. Dismissing it (Skip or the X) or finishing
// the tour it starts both stop it from showing again for that campaign -
// see Campaign.tsx for the persistence.
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTopLayerZIndex } from "@/components/ui/floating-panel";

interface TutorialPromptProps {
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
  title?: string;
  body?: string;
  /** Distinguishes which tutorial's prompt this is for automated testing/debugging - defaults to the main campaign tour's. */
  testId?: string;
}

export function TutorialPrompt({
  onStart,
  onSkip,
  onClose,
  title = "New here?",
  body = "Want a quick tour of the campaign screen - navigation, your character sheet, and notes?",
  testId = "tutorial-prompt",
}: TutorialPromptProps) {
  const z = useTopLayerZIndex();
  return (
    <div
      className="fixed bottom-4 left-4 w-72 rounded-lg border p-3 shadow-2xl"
      style={{
        zIndex: z || undefined,
        background: "hsl(var(--popover))",
        borderColor: "var(--button-outline)",
        color: "hsl(var(--popover-foreground))",
      }}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-bold">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 hover:opacity-70"
          style={{ color: "hsl(var(--muted-foreground))" }}
          title="Close"
          data-testid={`button-${testId}-close`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "hsl(var(--popover-foreground) / 0.85)" }}>
        {body}
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onSkip} data-testid={`button-${testId}-skip`}>
          Skip
        </Button>
        <Button size="sm" className="h-7 text-xs px-3" onClick={onStart} data-testid={`button-${testId}-continue`}>
          Continue
        </Button>
      </div>
    </div>
  );
}
