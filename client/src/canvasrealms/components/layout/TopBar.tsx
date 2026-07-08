import { useState } from "react";
import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { PresenceStack } from "@cr/components/layout/PresenceStack";
import { Button } from "@cr/components/ui/button";
import {
  Network,
  Globe,
  LayoutPanelLeft,
  Menu,
  Sparkles,
  Eye,
  Zap,
} from "lucide-react";
import {
  useGetRealm,
  getGetRealmQueryKey,
  useListNodes,
  getListNodesQueryKey,
  useUpdateNode,
} from "@workspace/api-client-react";
import { scanForMentions } from "@cr/lib/mentionScan";
import {
  dispatchApplyMentionsBatch,
  type ApplyMentionsBatchDetail,
} from "@cr/components/workspace/MentionSuggestionsStrip";
import { toast } from "sonner";

export function TopBar() {
  const {
    activeRealmId,
    viewMode,
    setViewMode,
    setLibraryOpen,
    setCompassOpen,
  } = useAppStore();
  const { data: realm } = useGetRealm(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getGetRealmQueryKey(activeRealmId || ""),
    },
  });
  const role = useRealmRole(activeRealmId);
  const canEdit = !!activeRealmId && !role.isViewer;

  return (
    <header className="absolute top-0 left-0 right-0 h-[calc(3.5rem_+_env(safe-area-inset-top))] z-40 flex items-center justify-between px-2 sm:px-4 bg-background/50 backdrop-blur-xl border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
        <Button
          data-guide="library-toggle"
          variant="ghost"
          size="icon"
          className="lg:hidden h-11 w-11"
          title="Open library"
          aria-label="Open library"
          onClick={() => setLibraryOpen(true)}
        >
          <Menu className="w-6 h-6" />
        </Button>
        <h1 className="font-semibold text-sm tracking-wide text-foreground/90 uppercase truncate">
          {realm?.name || "Select a Realm"}
        </h1>
        {activeRealmId && role.isViewer && (
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300/80 bg-amber-300/10 border border-amber-300/20 px-1.5 py-0.5 rounded-sm"
            title="You're viewing this realm in read-only mode."
          >
            <Eye className="w-3 h-3" />
            Viewer
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
        {/* Global "auto-link everything" — scans every text block of
            every node in the realm and replaces matched node-name
            substrings with `[[key]]` references. Placed just to the
            LEFT of the Windows/Graph/Wiki view-mode toggle as the user
            specified. Visible only to users with edit rights. */}
        {canEdit && activeRealmId && (
          <ApplyAllAutoLinksButton realmId={activeRealmId} />
        )}

        <div className="flex bg-muted/50 p-1 rounded-md border border-border/50">
          <Button
            variant={viewMode === "windows" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("windows")}
            className="px-2 sm:px-3 h-7 text-xs"
            title="Window mode"
            aria-label="Window mode"
          >
            <LayoutPanelLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5 sm:mr-2" />
            <span className="hidden sm:inline">Windows</span>
          </Button>
          <Button
            variant={viewMode === "graph" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("graph")}
            className="px-2 sm:px-3 h-7 text-xs"
            title="Graph mode"
            aria-label="Graph mode"
          >
            <Network className="w-4 h-4 sm:w-3.5 sm:h-3.5 sm:mr-2" />
            <span className="hidden sm:inline">Graph</span>
          </Button>
          <Button
            variant={viewMode === "wiki" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("wiki")}
            className="px-2 sm:px-3 h-7 text-xs"
            title="Wiki mode"
            aria-label="Wiki mode"
          >
            <Globe className="w-4 h-4 sm:w-3.5 sm:h-3.5 sm:mr-2" />
            <span className="hidden sm:inline">Wiki</span>
          </Button>
        </div>

        <Button
          data-guide="open-compass"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setCompassOpen(true)}
        >
          <Sparkles className="w-5 h-5 text-accent" />
        </Button>

        <PresenceStack />
      </div>

    </header>
  );
}

/**
 * Scans every text block of every node in the realm for substring
 * matches against other node titles and rewrites the matches into
 * `[[key]]` references in one sweep.
 *
 * Dispatch strategy:
 *  - For nodes that currently have an open editor mounted (i.e. are
 *    in `openNodeIds`), we send a per-block CustomEvent so the
 *    block's Y.Text-aware listener applies the edits. This keeps the
 *    live cursor / collaboration channel authoritative for open docs.
 *  - For closed nodes, we go straight to `updateNode` so the changes
 *    persist to the server even when nobody has them open.
 *
 * Splice math is done end -> start so earlier replacements never
 * invalidate later (start,end) offsets.
 */
function ApplyAllAutoLinksButton({ realmId }: { realmId: string }) {
  const { openNodeIds, viewMode } = useAppStore();
  const { data: realmNodes } = useListNodes(realmId, {
    query: {
      enabled: !!realmId,
      queryKey: getListNodesQueryKey(realmId),
    },
  });
  const updateNode = useUpdateNode();
  const [running, setRunning] = useState(false);

  const handleClick = async () => {
    if (running) return;
    if (!realmNodes || realmNodes.length === 0) {
      toast.info("Nothing to scan yet.");
      return;
    }
    setRunning(true);
    // A node is "live" (has a mounted DocumentEditor + Y.Text binding
    // that will receive the dispatched batch event) only when:
    //   (a) it is part of the current pane tree, AND
    //   (b) we are in Windows mode — Graph and Wiki modes unmount the
    //       per-pane editors, so dispatched events would silently land
    //       on no listener and the edits would be lost.
    // Anything else gets persisted via the API so the global sweep
    // never drops writes.
    const liveSet = new Set(viewMode === "windows" ? openNodeIds : []);
    type AnyBlock = {
      id: string;
      type?: string;
      text?: string;
      [k: string]: unknown;
    };

    let totalEdits = 0;
    let touchedNodes = 0;
    const apiQueue: Array<{ nodeId: string; blocks: AnyBlock[] }> = [];

    for (const node of realmNodes) {
      let rawBlocks =
        (node as { blocks?: AnyBlock[] }).blocks ?? [];

      // Legacy fallback: nodes that pre-date the block model still
      // carry their body in `content`. Synthesize a single text block
      // so the global sweep can scan + persist into the new schema.
      // Uses a deterministic id so re-runs are idempotent and the
      // post-write cache shape stays consistent with what readers
      // expect.
      if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
        const legacy = (node as { content?: string }).content ?? "";
        if (typeof legacy === "string" && legacy.trim().length > 0) {
          rawBlocks = [{ id: "legacy", type: "text", text: legacy }];
        } else {
          continue;
        }
      }

      let nodeChanged = false;
      const newBlocks: AnyBlock[] = [];
      const batches: ApplyMentionsBatchDetail[] = [];

      for (const block of rawBlocks) {
        if (block.type !== "text" || typeof block.text !== "string") {
          newBlocks.push(block);
          continue;
        }
        const text = block.text;
        const hits = scanForMentions(text, realmNodes, node.id);
        if (hits.length === 0) {
          newBlocks.push(block);
          continue;
        }
        // Group hits into a batch (for live editors) and also splice
        // text directly (for the API path).
        batches.push({
          nodeId: node.id,
          blockId: block.id,
          edits: hits.map((h) => ({
            start: h.start,
            end: h.end,
            replacement: `[[${h.target.key}]]`,
            expectedText: h.matchText,
            targetNodeId: h.target.id,
          })),
        });
        const ordered = [...hits].sort((a, b) => b.start - a.start);
        let next = text;
        for (const h of ordered) {
          next =
            next.slice(0, h.start) +
            `[[${h.target.key}]]` +
            next.slice(h.end);
        }
        newBlocks.push({ ...block, text: next });
        totalEdits += hits.length;
        nodeChanged = true;
      }

      if (!nodeChanged) continue;
      touchedNodes += 1;

      if (liveSet.has(node.id)) {
        // Editor is mounted — let the Y.Text-aware listener apply so
        // collaborators see the live edit and the open textarea state
        // stays consistent. The realtime backend persists the change.
        for (const b of batches) dispatchApplyMentionsBatch(b);
      } else {
        apiQueue.push({ nodeId: node.id, blocks: newBlocks });
      }
    }

    // Persist closed-node changes serially so we don't hammer the
    // server with N parallel writes for large realms.
    let apiFailures = 0;
    for (const item of apiQueue) {
      try {
        await updateNode.mutateAsync({
          nodeId: item.nodeId,
          data: { blocks: item.blocks, content: "" } as Parameters<
            typeof updateNode.mutate
          >[0]["data"],
        });
      } catch {
        apiFailures += 1;
      }
    }

    setRunning(false);

    if (totalEdits === 0) {
      toast.info("No new links to add — every mention is already linked.");
    } else if (apiFailures > 0) {
      toast.warning(
        `Linked ${totalEdits} mention(s) across ${touchedNodes} node(s), but ${apiFailures} failed to save.`,
      );
    } else {
      toast.success(
        `Linked ${totalEdits} mention(s) across ${touchedNodes} node(s).`,
      );
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={running}
      className="px-2 sm:px-3 h-7 text-xs border border-accent/40 text-accent hover:bg-accent/10"
      title="Scan every node and convert matched names to [[key]] links"
      aria-label="Apply all auto-links across every node"
    >
      <Zap className="w-4 h-4 sm:w-3.5 sm:h-3.5 sm:mr-2" />
      <span className="hidden sm:inline">
        {running ? "Linking..." : "Auto-link all"}
      </span>
    </Button>
  );
}

