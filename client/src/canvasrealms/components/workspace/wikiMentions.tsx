import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Node } from "@workspace/api-client-react";
import { getCaretCoordinates } from "@cr/lib/textareaCaret";
import { useAutoGrowTextarea } from "@cr/lib/useAutoGrowTextarea";

export const WIKI_REF_RE = /\[\[([^\]\s]+)\]\]/g;

export function parseReferencedKeys(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  WIKI_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_REF_RE.exec(text))) {
    const k = m[1]!;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

interface MentionTextareaProps {
  value: string;
  onChange: (next: string) => void;
  realmNodes: Node[];
  excludeNodeId?: string;
  readOnly?: boolean;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
}

export function MentionTextarea({
  value,
  onChange,
  realmNodes,
  excludeNodeId,
  readOnly,
  placeholder,
  rows = 3,
  autoFocus,
  className,
  onKeyDown,
  onBlur,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<{
    start: number;
    query: string;
    coords: { top: number; left: number; height: number };
  } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);

  // Auto-grow so the user sees the whole value, with the caller-provided
  // `rows` acting as a minimum height instead of a hard cap. The hook
  // uses a callback ref so it re-binds whenever the textarea remounts;
  // we compose it with our own `textareaRef` (used by mention-picker
  // positioning, focus, etc.) so both refs see the same element.
  const setAutoGrowEl = useAutoGrowTextarea(value, rows);
  const setTextareaEl = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      setAutoGrowEl(el);
    },
    [setAutoGrowEl],
  );

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const detectMention = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || readOnly) return;
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) {
      setMention(null);
      return;
    }
    const t = ta.value;
    const minStart = Math.max(0, pos - 64);
    let i = pos - 1;
    while (i >= minStart) {
      const ch = t[i]!;
      if (ch === "@") {
        const prev = i === 0 ? " " : t[i - 1]!;
        if (i === 0 || /[\s([{>,;:!?\n]/.test(prev)) {
          const slice = t.slice(i + 1, pos);
          if (/^[\w-]*$/.test(slice)) {
            let coords = { top: 0, left: 0, height: 16 };
            try {
              coords = getCaretCoordinates(ta, i);
            } catch {
              // ignore
            }
            setMention((prev) => {
              if (
                prev &&
                prev.start === i &&
                prev.query === slice &&
                prev.coords.top === coords.top &&
                prev.coords.left === coords.left
              ) {
                return prev;
              }
              return { start: i, query: slice, coords };
            });
            return;
          }
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i -= 1;
    }
    setMention(null);
  }, [readOnly]);

  const matches = useMemo(() => {
    if (!mention) return [] as Node[];
    const q = mention.query.toLowerCase();
    return realmNodes
      .filter((n) => n.id !== excludeNodeId)
      .filter(
        (n) =>
          !q ||
          n.key.toLowerCase().includes(q) ||
          n.title.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [mention, realmNodes, excludeNodeId]);

  useEffect(() => {
    if (!mention) return;
    if (mentionIdx >= matches.length) setMentionIdx(0);
  }, [mention, matches.length, mentionIdx]);

  const insertReference = useCallback(
    (target: Node) => {
      if (!mention) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const caret = ta.selectionStart;
      const before = value.slice(0, mention.start);
      const after = value.slice(caret);
      const insertion = `[[${target.key}]] `;
      const next = before + insertion + after;
      onChange(next);
      const pos = before.length + insertion.length;
      setMention(null);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [mention, value, onChange],
  );

  return (
    <div className="relative">
      <textarea
        ref={setTextareaEl}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detectMention();
        }}
        onSelect={detectMention}
        onMouseUp={detectMention}
        onBlur={() => {
          // Defer so popover button onMouseDown can fire first.
          setTimeout(() => setMention(null), 100);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (mention && matches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMentionIdx((i) => (i + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setMentionIdx(
                (i) => (i - 1 + matches.length) % matches.length,
              );
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const target = matches[mentionIdx];
              if (target) insertReference(target);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        readOnly={readOnly}
        rows={rows}
        placeholder={placeholder}
        className={
          (className ??
            "w-full bg-background border border-border rounded px-2 py-1 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50") +
          " overflow-hidden"
        }
      />
      {mention && !readOnly && matches.length > 0 && (
        <div
          className="absolute z-50 min-w-[14rem] max-w-xs rounded-md border border-border bg-popover shadow-lg overflow-hidden"
          style={{
            top: mention.coords.top + mention.coords.height + 2,
            left: mention.coords.left,
          }}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/60">
            Link a node
          </div>
          <div className="max-h-56 overflow-y-auto py-0.5">
            {matches.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertReference(n);
                }}
                onMouseEnter={() => setMentionIdx(i)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs ${
                  i === mentionIdx ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {n.key}
                </span>
                <span className="truncate text-foreground">
                  {n.title || "Untitled"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface RefChipsProps {
  text: string;
  nodesByKey: Map<string, Node>;
  onOpen: (target: Node) => void;
  // Optional secondary handler: right-click on desktop or long-press on
  // touch. Intended for "open in a new/next pane" while `onOpen` keeps
  // the chip's primary left-click behavior (open in the current pane).
  onOpenInNext?: (target: Node) => void;
  className?: string;
}

export function RefChips({
  text,
  nodesByKey,
  onOpen,
  onOpenInNext,
  className,
}: RefChipsProps) {
  const keys = useMemo(() => parseReferencedKeys(text), [text]);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  if (keys.length === 0) return null;
  return (
    <div className={className ?? "flex flex-wrap items-center gap-1 pt-1"}>
      {keys.map((k) => {
        const target = nodesByKey.get(k);
        if (!target) {
          return (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
              title="No node with this key in this realm"
            >
              <span className="font-mono">[[{k}]]</span>
              <span className="opacity-70">broken</span>
            </span>
          );
        }
        const title = onOpenInNext
          ? `Open ${target.title || target.key} (right-click or long-press to open in a new pane)`
          : `Open ${target.title || target.key}`;
        return (
          <button
            key={k}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (longPressFired.current) {
                longPressFired.current = false;
                return;
              }
              onOpen(target);
            }}
            onContextMenu={(e) => {
              if (!onOpenInNext) return;
              e.preventDefault();
              e.stopPropagation();
              onOpenInNext(target);
            }}
            onTouchStart={() => {
              if (!onOpenInNext) return;
              longPressFired.current = false;
              if (longPressTimer.current !== null) {
                window.clearTimeout(longPressTimer.current);
              }
              longPressTimer.current = window.setTimeout(() => {
                longPressFired.current = true;
                onOpenInNext(target);
              }, 500);
            }}
            onTouchEnd={() => {
              if (longPressTimer.current !== null) {
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
            }}
            onTouchMove={() => {
              // Cancel the pending long-press if the finger moves
              // (i.e. the user is scrolling), so we don't accidentally
              // open the link in a new pane while they scroll the page.
              if (longPressTimer.current !== null) {
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
              longPressFired.current = false;
            }}
            onTouchCancel={() => {
              if (longPressTimer.current !== null) {
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
              longPressFired.current = false;
            }}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20 transition-colors"
            title={title}
          >
            <span className="font-mono opacity-70">{target.key}</span>
            <span className="truncate max-w-[8rem]">
              {target.title || "Untitled"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
