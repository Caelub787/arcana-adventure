import { useEffect, useMemo, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import {
  useListNodes,
  getListNodesQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent } from "@cr/components/ui/dialog";
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@cr/components/ui/command";
import { useAppStore } from "@cr/lib/store";
import {
  BookOpen,
  FileText,
  Globe,
  LayoutGrid,
  Map as MapIcon,
  MapPin,
  Package,
  Sword,
  Users,
} from "lucide-react";

const KIND_ICONS = {
  character: Users,
  location: MapPin,
  lore: BookOpen,
  faction: Globe,
  event: Sword,
  item: Package,
  note: FileText,
  canvas: LayoutGrid,
  map: MapIcon,
} as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NodeLike {
  id: string;
  title: string;
  key?: string | null;
  kind?: string;
  content?: string;
  blocks?: Array<{
    type: string;
    text?: string;
    heading?: string;
    alt?: string;
  }>;
}

interface IndexedNode {
  node: NodeLike;
  titleLower: string;
  keyLower: string;
  contentLower: string;
  contentOriginal: string;
}

interface Result {
  node: NodeLike;
  score: number;
  excerpt?: { before: string; match: string; after: string };
}

const MAX_RESULTS = 50;
const EXCERPT_RADIUS = 40;

function buildSearchableContent(node: NodeLike): string {
  const parts: string[] = [];
  if (node.content) parts.push(node.content);
  if (node.blocks) {
    for (const b of node.blocks) {
      if (b.text) parts.push(b.text);
      if (b.heading) parts.push(b.heading);
      if (b.alt) parts.push(b.alt);
    }
  }
  return parts.join("\n\n");
}

function buildExcerpt(
  content: string,
  contentLower: string,
  needle: string,
): { before: string; match: string; after: string } | undefined {
  const idx = contentLower.indexOf(needle);
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - EXCERPT_RADIUS);
  const end = Math.min(content.length, idx + needle.length + EXCERPT_RADIUS);
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, idx),
    match: content.slice(idx, idx + needle.length),
    after:
      content.slice(idx + needle.length, end) +
      (end < content.length ? "…" : ""),
  };
}

export function SearchPalette({ open, onOpenChange }: Props) {
  const { activeRealmId, openNewNode } = useAppStore();

  const { data: nodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId && open,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });

  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Reset input each time the palette closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setRawQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // Debounce typing so we don't re-rank hundreds of nodes on every keystroke.
  useEffect(() => {
    if (rawQuery === debouncedQuery) return;
    const t = setTimeout(() => setDebouncedQuery(rawQuery), 120);
    return () => clearTimeout(t);
  }, [rawQuery, debouncedQuery]);

  // Precompute a lowercase index of every node once per node list. Doing this
  // up front keeps each keystroke O(n) string-scan instead of O(n) JSON walk.
  const indexed = useMemo<IndexedNode[]>(() => {
    return (nodes ?? []).map((n) => {
      const contentOriginal = buildSearchableContent(n as NodeLike);
      return {
        node: n as NodeLike,
        titleLower: (n.title ?? "").toLowerCase(),
        keyLower: (n.key ?? "").toLowerCase(),
        contentOriginal,
        contentLower: contentOriginal.toLowerCase(),
      };
    });
  }, [nodes]);

  const results = useMemo<Result[]>(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) {
      // Empty query: show every node, alphabetised by title (legacy behaviour).
      return indexed
        .slice()
        .sort((a, b) => a.titleLower.localeCompare(b.titleLower))
        .slice(0, MAX_RESULTS)
        .map((i) => ({ node: i.node, score: 0 }));
    }

    const scored: Result[] = [];
    for (const item of indexed) {
      const titleIdx = item.titleLower.indexOf(q);
      const keyIdx = item.keyLower.indexOf(q);
      const contentIdx = item.contentLower.indexOf(q);

      if (titleIdx < 0 && keyIdx < 0 && contentIdx < 0) continue;

      // Title hits rank above key hits, which rank above content-only hits.
      // Within each tier, earlier matches (e.g. prefix) win.
      let score = 0;
      if (titleIdx >= 0) {
        score = 1000 - Math.min(titleIdx, 100);
      } else if (keyIdx >= 0) {
        score = 500 - Math.min(keyIdx, 100);
      } else {
        score = 100 - Math.min(contentIdx, 100);
      }

      // Always try to surface a content excerpt around the matched phrase so
      // users get a snippet whether they hit on the title or the body.
      const excerpt =
        contentIdx >= 0
          ? buildExcerpt(item.contentOriginal, item.contentLower, q)
          : undefined;

      scored.push({ node: item.node, score, excerpt });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.node.title ?? "").localeCompare(b.node.title ?? "");
    });
    return scored.slice(0, MAX_RESULTS);
  }, [indexed, debouncedQuery]);

  const handleSelect = (nodeId: string, matchQuery?: string) => {
    onOpenChange(false);
    openNewNode(nodeId, matchQuery ? { matchQuery } : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <CommandPrimitive
          // We rank/filter ourselves so cmdk doesn't double-filter and hide
          // content-only matches whose titles don't contain the query.
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
        >
          <CommandInput
            placeholder="Search nodes by title or content…"
            autoFocus
            value={rawQuery}
            onValueChange={setRawQuery}
          />
          <CommandList>
            <CommandEmpty>No nodes found.</CommandEmpty>
            <CommandGroup heading="Nodes">
              {results.map((r) => {
                const n = r.node;
                const Icon =
                  KIND_ICONS[
                    (n.kind as keyof typeof KIND_ICONS) ?? "note"
                  ] ?? FileText;
                return (
                  <CommandItem
                    key={n.id}
                    value={n.id}
                    onSelect={() =>
                      handleSelect(n.id, r.excerpt ? debouncedQuery : undefined)
                    }
                  >
                    <Icon className="opacity-70" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{n.title || "Untitled"}</div>
                      {r.excerpt && (
                        <div className="truncate text-xs text-muted-foreground/80 mt-0.5">
                          {r.excerpt.before}
                          <mark className="bg-yellow-500/30 text-foreground rounded-sm px-0.5">
                            {r.excerpt.match}
                          </mark>
                          {r.excerpt.after}
                        </div>
                      )}
                    </div>
                    {n.key && (
                      <span className="font-mono text-[10px] text-muted-foreground/70 ml-2">
                        {n.key}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
