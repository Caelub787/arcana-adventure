import type { Node } from "@workspace/api-client-react";
import { WIKI_REF_RE } from "@cr/components/workspace/wikiMentions";

export interface MentionSuggestion {
  /** Index of the first character of the matched span within `text`. */
  start: number;
  /** Exclusive end index of the matched span within `text`. */
  end: number;
  /** The raw text that matched (preserves user's capitalization). */
  matchText: string;
  /** Node we would link to. */
  target: Node;
}

/** Escape a string so it can be embedded in a RegExp literally. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find ranges already inside a [[wiki-ref]] so we don't suggest them again. */
function findExistingRefRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  WIKI_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_REF_RE.exec(text))) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function rangeIsInside(
  ranges: Array<[number, number]>,
  start: number,
  end: number,
): boolean {
  for (const [a, b] of ranges) {
    if (start >= a && end <= b) return true;
  }
  return false;
}

/**
 * Scan `text` for words/phrases that match the title (or key) of another
 * node in the realm, and would benefit from being linked. Used by the
 * always-on Compass mention helper.
 *
 * Rules:
 *   - Word-boundary, case-insensitive match against `node.title`. Also
 *     matches the node's `key` (slug) as a fallback when it differs.
 *   - Only titles >= 3 chars are considered (avoids matching common
 *     short words). Pure-numeric titles are skipped for the same reason.
 *   - Skips matches that already sit inside a `[[...]]` ref, are
 *     preceded by `@` (the user is already typing a mention), or are
 *     immediately preceded by `[[`.
 *   - Skips the node we're scanning (`excludeNodeId`).
 *   - Each `target` appears at most once (first hit wins) so the
 *     suggestion strip stays compact. The match's position lets the
 *     apply step replace the right span.
 */
export function scanForMentions(
  text: string,
  candidates: Node[],
  excludeNodeId?: string,
): MentionSuggestion[] {
  if (!text || candidates.length === 0) return [];
  const existing = findExistingRefRanges(text);
  const out: MentionSuggestion[] = [];
  const usedTargets = new Set<string>();

  // Build a needle list per candidate: prefer title, also accept key when
  // it's a distinct multi-char word (e.g. "aragorn" vs title "Aragorn II").
  for (const node of candidates) {
    if (excludeNodeId && node.id === excludeNodeId) continue;
    if (usedTargets.has(node.id)) continue;

    const needles: string[] = [];
    const title = (node.title || "").trim();
    if (title.length >= 3 && !/^\d+$/.test(title)) needles.push(title);
    const key = (node.key || "").trim();
    if (
      key.length >= 3 &&
      key.toLowerCase() !== title.toLowerCase() &&
      /[a-z]/i.test(key)
    ) {
      needles.push(key);
    }
    if (needles.length === 0) continue;

    // Try the longest needle first so a multi-word title wins over the
    // single-word key.
    needles.sort((a, b) => b.length - a.length);

    let bestMatch: MentionSuggestion | null = null;
    for (const needle of needles) {
      // \b doesn't always behave well with non-ASCII or punctuation in the
      // needle; use explicit lookarounds for non-word chars on either side.
      const re = new RegExp(
        `(^|[^\\w@\\[])(${escapeRegExp(needle)})(?=$|[^\\w])`,
        "gi",
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const matchStart = m.index + m[1].length;
        const matchEnd = matchStart + m[2].length;
        // Skip if inside an existing [[ref]] or right after `[[`.
        if (rangeIsInside(existing, matchStart, matchEnd)) continue;
        const twoBefore = text.slice(Math.max(0, matchStart - 2), matchStart);
        if (twoBefore.endsWith("[[")) continue;
        bestMatch = {
          start: matchStart,
          end: matchEnd,
          matchText: m[2],
          target: node,
        };
        break;
      }
      if (bestMatch) break;
    }
    if (bestMatch) {
      out.push(bestMatch);
      usedTargets.add(node.id);
    }
  }
  // Sort by appearance order so the chip row reads in document order.
  out.sort((a, b) => a.start - b.start);
  return out;
}
