import { Link2, Sparkles, X, Zap } from "lucide-react";
import type { MentionSuggestion } from "@cr/lib/mentionScan";

/**
 * Payload of the cross-component `reborn:apply-mention` CustomEvent.
 * Listened to by `TextBlock` inside `DocumentEditor` so an apply triggered
 * from anywhere in the app (e.g. the Compass sidebar) reuses the
 * block's Y.Text-aware edit path.
 */
export interface ApplyMentionDetail {
  nodeId: string;
  blockId: string;
  start: number;
  end: number;
  /** What to splice in (typically `[[<target.key>]]`). */
  replacement: string;
  /**
   * The text we expected to find at `text.slice(start, end)` when the
   * suggestion was generated. The listener verifies the slice still
   * matches before applying — protects against stale events landing on
   * a span the user has since edited (e.g. typed more text before the
   * match, deleted around it, etc.).
   */
  expectedText: string;
  /** Target node id, used for analytics / relationship creation. */
  targetNodeId: string;
}

export const APPLY_MENTION_EVENT = "reborn:apply-mention";

export function dispatchApplyMention(detail: ApplyMentionDetail) {
  window.dispatchEvent(new CustomEvent(APPLY_MENTION_EVENT, { detail }));
}

/**
 * Payload of the `reborn:apply-mentions-batch` CustomEvent used by
 * "Apply all" actions. Each batch targets ONE block and contains all
 * the edits to apply atomically — the listener splices from end to
 * start in a single `applyEdit` call so earlier edits never invalidate
 * later positions and the user sees one undoable change.
 */
export interface ApplyMentionsBatchDetail {
  nodeId: string;
  blockId: string;
  edits: Array<{
    start: number;
    end: number;
    replacement: string;
    expectedText: string;
    targetNodeId: string;
  }>;
}

export const APPLY_MENTIONS_BATCH_EVENT = "reborn:apply-mentions-batch";

export function dispatchApplyMentionsBatch(detail: ApplyMentionsBatchDetail) {
  window.dispatchEvent(
    new CustomEvent(APPLY_MENTIONS_BATCH_EVENT, { detail }),
  );
}

export interface AggregatedSuggestion extends MentionSuggestion {
  /** Block this suggestion lives in. */
  blockId: string;
  /** Short context snippet (a few words around the match) for the tooltip. */
  context: string;
}

interface Props {
  suggestions: AggregatedSuggestion[];
  nodeId: string;
  /**
   * Variant controls the visual density. `inline` is used inside the
   * document editor; `compact` is used in the Compass sidebar header.
   */
  variant?: "inline" | "compact";
  /**
   * Local-only dismissal. When provided, an X button is rendered that
   * calls this to hide an individual suggestion without applying.
   */
  onDismiss?: (suggestion: AggregatedSuggestion) => void;
  /**
   * Hide-all toggle. When provided, an outer X collapses the whole
   * strip until the underlying suggestions change.
   */
  onHideAll?: () => void;
}

export function MentionSuggestionsStrip({
  suggestions,
  nodeId,
  variant = "inline",
  onDismiss,
  onHideAll,
}: Props) {
  if (suggestions.length === 0) return null;

  const apply = (s: AggregatedSuggestion) => {
    dispatchApplyMention({
      nodeId,
      blockId: s.blockId,
      start: s.start,
      end: s.end,
      replacement: `[[${s.target.key}]]`,
      expectedText: s.matchText,
      targetNodeId: s.target.id,
    });
  };

  // Group suggestions by block and dispatch one batch event per block.
  // The TextBlock listener applies all of a block's edits in a single
  // splice pass (end -> start), which avoids the race where applying
  // event #1 hasn't re-rendered yet by the time event #2's handler
  // computes its slice and silently mismatches expectedText.
  const applyAll = () => {
    const byBlock = new Map<string, AggregatedSuggestion[]>();
    for (const s of suggestions) {
      const arr = byBlock.get(s.blockId) ?? [];
      arr.push(s);
      byBlock.set(s.blockId, arr);
    }
    for (const [blockId, group] of byBlock) {
      dispatchApplyMentionsBatch({
        nodeId,
        blockId,
        edits: group.map((s) => ({
          start: s.start,
          end: s.end,
          replacement: `[[${s.target.key}]]`,
          expectedText: s.matchText,
          targetNodeId: s.target.id,
        })),
      });
    }
  };

  const isCompact = variant === "compact";
  return (
    <div
      className={
        isCompact
          ? "rounded-md border border-accent/30 bg-accent/5 px-2 py-1.5 text-xs"
          : "rounded-md border border-accent/30 bg-accent/5 px-2.5 py-2 text-xs"
      }
      data-testid="mention-suggestions-strip"
    >
      <div className="flex items-center gap-1.5 mb-1 text-accent/90">
        <Sparkles className="h-3 w-3" />
        <span className="font-medium">Compass suggests linking</span>
        <span className="text-muted-foreground/80">
          {suggestions.length} possible {suggestions.length === 1 ? "link" : "links"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {suggestions.length > 1 && (
            <button
              type="button"
              onClick={applyAll}
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] uppercase tracking-wider text-accent hover:text-accent-foreground hover:bg-accent/20 border border-accent/40"
              title="Replace every suggested word with a link"
              aria-label="Apply all suggestions"
            >
              <Zap className="h-3 w-3" />
              <span>Apply all</span>
            </button>
          )}
          {onHideAll && (
            <button
              type="button"
              onClick={onHideAll}
              className="h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center"
              title="Hide suggestions"
              aria-label="Hide suggestions"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {suggestions.map((s) => (
          <span
            key={`${s.blockId}:${s.start}:${s.target.id}`}
            className="inline-flex items-center gap-0.5 rounded-full border border-accent/30 bg-background/60 pl-0.5 text-[11px]"
          >
            <button
              type="button"
              onClick={() => apply(s)}
              title={`Replace "${s.matchText}" with a link to ${s.target.title || s.target.key}`}
              className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 hover:bg-accent/15 transition-colors"
            >
              <Link2 className="h-3 w-3 text-accent" />
              <span className="truncate max-w-[10rem] text-foreground">
                {s.target.title || s.target.key}
              </span>
              <span className="text-muted-foreground/70">
                ({s.matchText})
              </span>
            </button>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(s)}
                title="Dismiss"
                aria-label="Dismiss"
                className="h-5 w-5 rounded-r-full text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
