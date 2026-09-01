import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import {
  Node,
  useUpdateNode,
  useListNodes,
  useCreateRelationship,
  getGetNodeQueryKey,
  getListNodesQueryKey,
  getListRelationshipsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { X, Minus, Maximize2, Minimize2, StickyNote, Square, Bold, Italic, Heading2, Link as LinkIcon, List, Code, Sparkles, Loader2, Check, Lock, Unlock, Users } from "lucide-react";
import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { Button } from "@cr/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@cr/components/ui/popover";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { diffWordsWithSpace, diffLines, type Change } from "diff";
import { useNodeYText, useRealtime } from "@cr/lib/realtime";
import { bindYTextToTextarea } from "@cr/lib/yTextarea";

type DiffViewProps = {
  base: string;
  proposed: string;
};

type DiffMode = "word" | "line";

const COLLAPSE_LINE_THRESHOLD = 4;
const CONTEXT_LINES = 1;
const AUTO_LINE_MODE_LEN = 1200;

type UnchangedRunProps = {
  value: string;
};

const UnchangedRun = ({ value }: UnchangedRunProps) => {
  const [expanded, setExpanded] = useState(false);
  const lines = value.split("\n");
  const totalLines = lines.length;
  if (expanded || totalLines <= COLLAPSE_LINE_THRESHOLD) {
    return <span className="text-muted-foreground">{value}</span>;
  }
  const head = lines.slice(0, CONTEXT_LINES).join("\n");
  const tail = lines.slice(totalLines - CONTEXT_LINES).join("\n");
  const hidden = totalLines - CONTEXT_LINES * 2;
  return (
    <>
      {head.length > 0 && (
        <span className="text-muted-foreground">{head}</span>
      )}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="my-1 block w-full rounded-sm border border-dashed border-border/60 bg-muted/20 px-2 py-0.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        … {hidden} unchanged line{hidden === 1 ? "" : "s"} (show)
      </button>
      {tail.length > 0 && (
        <span className="text-muted-foreground">{tail}</span>
      )}
    </>
  );
};

const DiffView = memo(({ base, proposed }: DiffViewProps) => {
  const autoLineMode = base.length + proposed.length > AUTO_LINE_MODE_LEN;
  const [mode, setMode] = useState<DiffMode>(autoLineMode ? "line" : "word");
  const parts = useMemo<Change[]>(
    () =>
      mode === "line"
        ? diffLines(base, proposed)
        : diffWordsWithSpace(base, proposed),
    [base, proposed, mode],
  );
  const hasChanges = parts.some((p) => p.added || p.removed);
  if (!hasChanges) {
    return (
      <div className="text-[11px] italic text-muted-foreground">
        No changes. Compass returned the same content.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <div className="inline-flex overflow-hidden rounded border border-border text-[10px]">
          <button
            type="button"
            onClick={() => setMode("word")}
            className={`px-1.5 py-0.5 ${
              mode === "word"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Word
          </button>
          <button
            type="button"
            onClick={() => setMode("line")}
            className={`px-1.5 py-0.5 ${
              mode === "line"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Line
          </button>
        </div>
      </div>
      <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/90">
        {parts.map((p, i) => {
          if (p.added) {
            return (
              <span
                key={i}
                className="rounded-sm bg-emerald-500/20 px-0.5 text-emerald-200"
              >
                {p.value}
              </span>
            );
          }
          if (p.removed) {
            return (
              <span
                key={i}
                className="rounded-sm bg-rose-500/20 px-0.5 text-rose-200 line-through decoration-rose-400/70"
              >
                {p.value}
              </span>
            );
          }
          return <UnchangedRun key={`${mode}-${i}`} value={p.value} />;
        })}
      </div>
    </div>
  );
});
DiffView.displayName = "DiffView";

export const CustomNodeWindow = memo(({ id, data, selected }: NodeProps) => {
  const node = data.node as Node;
  const onClose = (data as { onClose?: () => void }).onClose;
  const { activeRealmId, focusedNodeIdFullscreen, toggleFocusedNode } = useAppStore();
  const { canEdit, isEditor } = useRealmRole(activeRealmId);

  // Per-node effective access: editors can always edit; a realm *viewer* may be
  // editing through a per-node grant, so we OR in the server's verdict.
  type NodeAccess = {
    role: string;
    isPrivate: boolean;
    canManage: boolean;
    canEdit: boolean;
    canView: boolean;
    granted: boolean;
  };
  const { data: nodeAccess } = useQuery<NodeAccess>({
    queryKey: ["cr-node-access", node.id],
    queryFn: () =>
      customFetch<NodeAccess>(`/api/nodes/${node.id}/my-access`, {
        responseType: "json",
      }),
    enabled: !!node.id,
  });
  const canManageAccess = nodeAccess?.canManage ?? isEditor;
  const readOnly = !(canEdit || nodeAccess?.canEdit);
  // A realm *viewer* editing through a per-node grant cannot persist body via
  // the realtime (Yjs) channel — the WS layer rejects all viewer writes since
  // the doc is realm-scoped. For those users we must flush content via REST
  // instead of relying on realtime persistence.
  const restBodyPersist = !canEdit && !!nodeAccess?.canEdit;
  const isNodeFocused = focusedNodeIdFullscreen === node.id;
  const closeNode = (_id: string) => onClose?.();
  const updateNode = useUpdateNode();
  const createRelationship = useCreateRelationship();
  const queryClient = useQueryClient();
  const yText = useNodeYText(id);
  const realtime = useRealtime();
  const yOriginRef = useRef<symbol>(Symbol("local-window-edit"));

  const applyContentEdit = useCallback(
    (next: string) => {
      setContent(next);
      if (yText && realtime) {
        realtime.doc.transact(() => {
          if (yText.length > 0) yText.delete(0, yText.length);
          if (next.length > 0) yText.insert(0, next);
        }, yOriginRef.current);
      }
    },
    [yText, realtime],
  );

  const isPrivate = nodeAccess?.isPrivate ?? node.isPrivate ?? false;
  const [grantsOpen, setGrantsOpen] = useState(false);

  type GrantRow = { userId: string; name: string };
  type CandidateRow = { userId: string; name: string; source: string };
  const { data: grantRows } = useQuery<GrantRow[]>({
    queryKey: ["cr-node-grants", node.id],
    queryFn: () =>
      customFetch<GrantRow[]>(`/api/nodes/${node.id}/grants`, {
        responseType: "json",
      }),
    enabled: !!node.id && grantsOpen && canManageAccess,
  });
  const { data: candidateRows } = useQuery<CandidateRow[]>({
    queryKey: ["cr-grant-candidates", activeRealmId],
    queryFn: () =>
      customFetch<CandidateRow[]>(
        `/api/realms/${activeRealmId}/grant-candidates`,
        { responseType: "json" },
      ),
    enabled: !!activeRealmId && grantsOpen && canManageAccess,
  });

  const togglePrivacy = useMutation({
    mutationFn: () =>
      customFetch(`/api/nodes/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPrivate: !isPrivate }),
        responseType: "json",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cr-node-access", node.id] });
      queryClient.invalidateQueries({ queryKey: getGetNodeQueryKey(node.id) });
      if (activeRealmId) {
        queryClient.invalidateQueries({
          queryKey: getListNodesQueryKey(activeRealmId),
        });
      }
    },
  });

  const grantedSet = useMemo(
    () => new Set((grantRows ?? []).map((g) => g.userId)),
    [grantRows],
  );
  const toggleGrant = useMutation({
    mutationFn: ({ userId, grant }: { userId: string; grant: boolean }) =>
      customFetch(`/api/nodes/${node.id}/grants/${userId}`, {
        method: grant ? "PUT" : "DELETE",
        responseType: grant ? "json" : "text",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cr-node-grants", node.id] });
    },
  });

  const { data: realmNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });

  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(node.content);
  const [tagDraft, setTagDraft] = useState("");
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  type CompassAction = "expand" | "rewrite" | "continue" | "custom";
  type CompassSelection = { start: number; end: number; text: string };
  const [compassOpen, setCompassOpen] = useState(false);
  const [compassBusy, setCompassBusy] = useState(false);
  const [compassError, setCompassError] = useState<string | null>(null);
  const [compassInstruction, setCompassInstruction] = useState("");
  const [activeSelection, setActiveSelection] = useState<CompassSelection | null>(null);
  const [compassEditing, setCompassEditing] = useState(false);
  const [compassDraft, setCompassDraft] = useState("");
  const [compassProposal, setCompassProposal] = useState<
    | {
        scope: "node";
        action: CompassAction;
        proposedContent: string;
        baseContent: string;
        note?: string;
      }
    | {
        scope: "selection";
        action: CompassAction;
        proposedContent: string;
        baseContent: string;
        selection: { start: number; end: number; originalText: string };
        note?: string;
      }
    | null
  >(null);

  const updateSelectionFromTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (end > start) {
      setActiveSelection({ start, end, text: ta.value.slice(start, end) });
    } else {
      setActiveSelection(null);
    }
  }, []);

  const requestCompassEdit = async (action: CompassAction) => {
    if (compassBusy) return;
    setCompassBusy(true);
    setCompassError(null);
    setCompassProposal(null);
    const selectionForRequest =
      activeSelection &&
      activeSelection.end <= content.length &&
      content.slice(activeSelection.start, activeSelection.end) === activeSelection.text
        ? activeSelection
        : null;
    try {
      const res = await fetch(`/api/nodes/${id}/compass-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          instruction: compassInstruction.trim() || undefined,
          currentContent: content,
          selection: selectionForRequest ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        scope: "node" | "selection";
        proposedContent: string;
        selection?: { start: number; end: number; originalText: string };
        note?: string;
      };
      if (data.scope === "selection" && data.selection) {
        setCompassProposal({
          scope: "selection",
          action,
          proposedContent: data.proposedContent,
          baseContent: content,
          selection: data.selection,
          note: data.note,
        });
      } else {
        setCompassProposal({
          scope: "node",
          action,
          proposedContent: data.proposedContent,
          baseContent: content,
          note: data.note,
        });
      }
      setCompassDraft(data.proposedContent);
      setCompassEditing(false);
    } catch (e) {
      setCompassError(e instanceof Error ? e.message : "Compass edit failed");
    } finally {
      setCompassBusy(false);
    }
  };

  const acceptCompassProposal = () => {
    if (!compassProposal) return;
    const proposedText = compassDraft;
    let newContent: string;
    if (compassProposal.scope === "selection") {
      const { start, end, originalText } = compassProposal.selection;
      // Only splice when the exact original range still holds. Avoid any
      // substring fallback — repeated identical snippets would otherwise
      // make us replace the wrong occurrence and corrupt unrelated text.
      if (
        end <= content.length &&
        content.slice(start, end) === originalText
      ) {
        newContent =
          content.slice(0, start) +
          proposedText +
          content.slice(end);
      } else {
        setCompassError(
          "The highlighted text changed since Compass started. Discard and try again.",
        );
        return;
      }
    } else {
      newContent = proposedText;
    }
    applyContentEdit(newContent);
    if (!yText) {
      mutateFnRef.current(
        { nodeId: id, data: { content: newContent } },
        { onSuccess: patchLocal },
      );
    }
    lastSaved.current = { title, content: newContent };
    setCompassProposal(null);
    setCompassInstruction("");
    setActiveSelection(null);
    setCompassEditing(false);
    setCompassDraft("");
  };

  const rejectCompassProposal = () => {
    setCompassProposal(null);
    setCompassEditing(false);
    setCompassDraft("");
  };

  const mentionMatches = useMemo(() => {
    if (!mention || !realmNodes) return [];
    const q = mention.query.toLowerCase();
    return realmNodes
      .filter((n) => n.id !== id && n.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, realmNodes, id]);

  const initializedForId = useRef<string | null>(null);
  const lastSaved = useRef({ title: node.title, content: node.content });
  const mutateFnRef = useRef(updateNode.mutate);
  mutateFnRef.current = updateNode.mutate;

  // Init
  useEffect(() => {
    if (node && initializedForId.current !== id) {
      initializedForId.current = id;
      setTitle(node.title);
      setContent(node.content);
      lastSaved.current = { title: node.title, content: node.content };
    }
  }, [node, id]);

  const patchLocal = useCallback(
    (updated: Node) => {
      queryClient.setQueryData(getGetNodeQueryKey(id), updated);
      if (activeRealmId) {
        queryClient.setQueryData(
          getListNodesQueryKey(activeRealmId),
          (old: Node[] | undefined) => old?.map((n) => (n.id === id ? updated : n)),
        );
      }
    },
    [id, queryClient, activeRealmId],
  );

  const commitTag = () => {
    const t = tagDraft.trim().replace(/^#+/, "");
    if (!t) return;
    const next = Array.from(new Set([...(node.tags ?? []), t]));
    mutateFnRef.current(
      { nodeId: id, data: { tags: next } },
      { onSuccess: patchLocal },
    );
    setTagDraft("");
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    const caret = e.target.selectionStart;
    const upto = value.slice(0, caret);
    const m = /(?:^|\s)@([\w-]{0,40})$/.exec(upto);
    if (m) {
      setMention({ query: m[1], start: caret - m[1].length - 1 });
      setMentionIdx(0);
    } else {
      setMention(null);
    }
  };

  const insertMention = (target: Node) => {
    if (!mention || !activeRealmId) return;
    const before = content.slice(0, mention.start);
    const after = content.slice((textareaRef.current?.selectionStart ?? mention.start));
    const insertion = `[[${target.title}]]`;
    const next = `${before}${insertion}${after}`;
    applyContentEdit(next);
    setMention(null);
    createRelationship.mutate(
      {
        realmId: activeRealmId,
        data: { fromNodeId: id, toNodeId: target.id },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListRelationshipsQueryKey(activeRealmId),
          });
        },
      },
    );
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const pos = before.length + insertion.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (left: string, right: string) => {
    if (readOnly) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const next = content.slice(0, start) + left + selected + right + content.slice(end);
    applyContentEdit(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + left.length, end + left.length);
    });
  };

  const prefixLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lineStart = content.lastIndexOf("\n", pos - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    applyContentEdit(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos + prefix.length, pos + prefix.length);
    });
  };

  const onContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      if (e.key === "b") { e.preventDefault(); wrapSelection("**", "**"); return; }
      if (e.key === "i") { e.preventDefault(); wrapSelection("_", "_"); return; }
    }
    if (!mention || mentionMatches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIdx((i) => (i + 1) % mentionMatches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(mentionMatches[mentionIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
    }
  };

  const removeTag = (t: string) => {
    const next = (node.tags ?? []).filter((x) => x !== t);
    mutateFnRef.current(
      { nodeId: id, data: { tags: next } },
      { onSuccess: patchLocal },
    );
  };

  const saveNode = useCallback((newTitle: string, newContent: string) => {
    mutateFnRef.current({ 
      nodeId: id, 
      data: { title: newTitle, content: newContent } 
    }, {
      onSuccess: (updated) => {
        // Patch locally
        queryClient.setQueryData(getGetNodeQueryKey(id), updated);
        if (activeRealmId) {
          queryClient.setQueryData(getListNodesQueryKey(activeRealmId), (old: Node[] | undefined) => 
            old?.map(n => n.id === id ? updated : n)
          );
        }
      }
    });
  }, [id, queryClient, activeRealmId]);

  // Debounced auto-save
  useEffect(() => {
    if (initializedForId.current !== id) return;
    const timer = setTimeout(() => {
      if (yText && !restBodyPersist) {
        // Realtime persists body — only flush title via REST.
        if (title !== lastSaved.current.title) {
          mutateFnRef.current({ nodeId: id, data: { title } });
          lastSaved.current = { ...lastSaved.current, title };
        }
        return;
      }
      // No realtime (yText absent) OR a granted viewer whose realtime body
      // writes are rejected — persist both title and content via REST.
      if (title !== lastSaved.current.title || content !== lastSaved.current.content) {
        saveNode(title, content);
        lastSaved.current = { title, content };
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [title, content, id, saveNode, yText, restBodyPersist]);

  // Bind window textarea(s) <-> Y.Text. Re-run when the node id flips
  // (component is reused across nodes via React Flow node memoization).
  useEffect(() => {
    if (!yText || !realtime) return;
    const el = textareaRef.current;
    if (!el) return;
    const initial = yText.toString();
    if (initial !== content) {
      setContent(initial);
      lastSaved.current = { ...lastSaved.current, content: initial };
    }
    const dispose = bindYTextToTextarea(
      yText,
      el,
      realtime.doc,
      yOriginRef.current,
    );
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText, realtime, id, node.mode, node.minimized]);

  const toggleMode = () => {
    const newMode = node.mode === "window" ? "sticky" : "window";
    mutateFnRef.current({
      nodeId: id,
      data: { mode: newMode }
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetNodeQueryKey(id), updated);
        if (activeRealmId) {
          queryClient.setQueryData(getListNodesQueryKey(activeRealmId), (old: Node[] | undefined) => 
            old?.map(n => n.id === id ? updated : n)
          );
        }
      }
    });
  };

  const toggleMinimize = () => {
    const newMin = !node.minimized;
    mutateFnRef.current({
      nodeId: id,
      data: { minimized: newMin }
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetNodeQueryKey(id), updated);
        if (activeRealmId) {
          queryClient.setQueryData(getListNodesQueryKey(activeRealmId), (old: Node[] | undefined) => 
            old?.map(n => n.id === id ? updated : n)
          );
        }
      }
    });
  };

  if (node.mode === "sticky") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{ width: "100%", height: "100%" }}
      ><div 
        className={`
          relative flex flex-col w-full h-full rounded-md border-2 shadow-md overflow-hidden transition-colors
          ${selected ? "border-primary shadow-primary/20" : "border-transparent"}
        `}
        style={{ backgroundColor: node.color || "hsl(var(--card))" }}
      >
        <NodeResizer color="hsl(var(--primary))" isVisible={selected} minWidth={150} minHeight={150} />
        <div
          className="flex items-center justify-between px-2 py-1 bg-foreground/10 custom-drag-handle cursor-grab active:cursor-grabbing"
          title={node.key ? `${title || "Untitled"} · ${node.key}` : undefined}
        >
          <input 
            className="bg-transparent border-none focus:ring-0 font-medium text-sm text-foreground w-full truncate"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={readOnly}
          />
          {node.key && (
            <span className="font-mono text-[10px] text-foreground/50 mr-1 flex-shrink-0">
              {node.key}
            </span>
          )}
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-foreground/20" onClick={toggleMode}>
              <Square className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 hover:bg-foreground/20"
              onClick={() => toggleFocusedNode(node.id)}
              title={isNodeFocused ? "Exit focus mode" : "Focus mode"}
              aria-label={isNodeFocused ? "Exit focus mode" : "Focus mode"}
            >
              {isNodeFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-foreground/20" onClick={() => closeNode(id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {!node.minimized && (
          <div className="flex-1 p-2 nodrag overflow-hidden">
             <textarea
              ref={textareaRef}
              className="w-full h-full bg-transparent border-none focus:ring-0 resize-none text-sm text-foreground/90"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={readOnly}
              placeholder="Sticky note..."
            />
          </div>
        )}
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ width: "100%", height: "100%" }}
    ><div 
      className={`
        relative flex flex-col w-full h-full bg-card rounded-xl border-2 shadow-2xl overflow-hidden transition-colors
        ${selected ? "border-primary shadow-primary/20" : "border-card-border shadow-foreground/30"}
      `}
    >
      <NodeResizer 
        color="hsl(var(--primary))" 
        isVisible={selected} 
        minWidth={250} 
        minHeight={node.minimized ? 48 : 200} 
      />
      
      {/* Title Bar (Drag Handle) */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border custom-drag-handle cursor-grab active:cursor-grabbing"
        title={node.key ? `${title || "Untitled"} · ${node.key}` : undefined}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: node.color || "hsl(var(--primary))" }} />
          <input 
            className="bg-transparent border-none focus:ring-0 font-medium text-sm text-foreground w-full truncate"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={readOnly}
          />
          {node.key && (
            <span className="font-mono text-[10px] text-muted-foreground/70 flex-shrink-0">
              {node.key}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
          {isPrivate && !canManageAccess && (
            <span title="Private node" className="px-0.5">
              <Lock className="h-3 w-3 text-amber-500" />
            </span>
          )}
          {canManageAccess && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => togglePrivacy.mutate()}
              disabled={togglePrivacy.isPending}
              title={isPrivate ? "Private, click to make visible" : "Visible, click to make private"}
              aria-label={isPrivate ? "Make node visible" : "Make node private"}
            >
              {isPrivate ? (
                <Lock className="h-3 w-3 text-amber-500" />
              ) : (
                <Unlock className="h-3 w-3" />
              )}
            </Button>
          )}
          {canManageAccess && (
            <Popover open={grantsOpen} onOpenChange={setGrantsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Manage edit access"
                  aria-label="Manage edit access"
                >
                  <Users className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 p-3 nodrag"
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-xs font-medium mb-1">Edit access</div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Grant specific viewers permission to edit this node.
                </p>
                {(candidateRows ?? []).length === 0 ? (
                  <div className="text-[11px] text-muted-foreground py-1">
                    No players or viewers to grant.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(candidateRows ?? []).map((c) => {
                      const granted = grantedSet.has(c.userId);
                      return (
                        <label
                          key={c.userId}
                          className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={granted}
                            disabled={toggleGrant.isPending}
                            onChange={(e) =>
                              toggleGrant.mutate({
                                userId: c.userId,
                                grant: e.target.checked,
                              })
                            }
                          />
                          <span className="truncate flex-1">{c.name}</span>
                          <span className="text-[9px] uppercase text-muted-foreground">
                            {c.source}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleMode}>
            <StickyNote className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => toggleFocusedNode(node.id)}
            title={isNodeFocused ? "Exit focus mode" : "Focus mode"}
            aria-label={isNodeFocused ? "Exit focus mode" : "Focus mode"}
          >
            {isNodeFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleMinimize}>
            {node.minimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground" onClick={() => closeNode(node.id)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Body */}
      {!node.minimized && (
        <div className="flex-1 flex flex-col overflow-hidden nodrag">
          {!readOnly && (
          <>
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-muted/20">
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Bold" onMouseDown={(e) => { e.preventDefault(); wrapSelection("**", "**"); }}>
              <Bold className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Italic" onMouseDown={(e) => { e.preventDefault(); wrapSelection("_", "_"); }}>
              <Italic className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Heading" onMouseDown={(e) => { e.preventDefault(); prefixLine("## "); }}>
              <Heading2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="List" onMouseDown={(e) => { e.preventDefault(); prefixLine("- "); }}>
              <List className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Code" onMouseDown={(e) => { e.preventDefault(); wrapSelection("`", "`"); }}>
              <Code className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Link" onMouseDown={(e) => { e.preventDefault(); wrapSelection("[", "](url)"); }}>
              <LinkIcon className="h-3 w-3" />
            </Button>
            <div className="flex-1" />
            <Button
              variant={compassOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 gap-1 text-[11px]"
              title="Ask Compass to edit this node"
              onClick={() => setCompassOpen((v) => !v)}
            >
              <Sparkles className="h-3 w-3 text-accent" />
              Compass
            </Button>
          </div>
          {compassOpen && (
            <div className="border-b border-border bg-accent/5 px-3 py-2 space-y-2">
              {!compassProposal && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {activeSelection ? "Edit selection" : "Edit whole node"}
                    </div>
                    {activeSelection && (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        onClick={() => setActiveSelection(null)}
                      >
                        Use whole node instead
                      </button>
                    )}
                  </div>
                  {activeSelection && (
                    <div className="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-foreground/80 max-h-16 overflow-auto whitespace-pre-wrap">
                      <span className="text-accent font-medium mr-1">“</span>
                      {activeSelection.text.length > 240
                        ? `${activeSelection.text.slice(0, 240)}…`
                        : activeSelection.text}
                      <span className="text-accent font-medium ml-1">”</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={compassBusy}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => requestCompassEdit("expand")}
                    >
                      Expand
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={compassBusy}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => requestCompassEdit("rewrite")}
                    >
                      Rewrite
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={compassBusy}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => requestCompassEdit("continue")}
                    >
                      Continue
                    </Button>
                    {compassBusy && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Compass is writing...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={compassInstruction}
                      onChange={(e) => setCompassInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && compassInstruction.trim()) {
                          e.preventDefault();
                          void requestCompassEdit("custom");
                        }
                      }}
                      placeholder={
                        activeSelection
                          ? "Tell Compass how to change the highlighted text..."
                          : "Or tell Compass exactly what to change..."
                      }
                      disabled={compassBusy}
                      className="flex-1 bg-background/60 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                    />
                    <Button
                      size="sm"
                      variant="default"
                      disabled={compassBusy || !compassInstruction.trim()}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => requestCompassEdit("custom")}
                    >
                      Send
                    </Button>
                  </div>
                </>
              )}
              {compassError && (
                <div className="text-[11px] text-destructive border border-destructive/30 rounded px-2 py-1 bg-destructive/10">
                  {compassError}
                </div>
              )}
              {compassProposal && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Compass proposed{" "}
                      {compassProposal.scope === "selection"
                        ? "selection edit"
                        : "edit"}{" "}
                      · {compassProposal.action}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={compassEditing ? "secondary" : "ghost"}
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setCompassEditing((v) => !v)}
                        title={compassEditing ? "Hide editor" : "Tweak the proposal before accepting"}
                      >
                        {compassEditing ? "Done editing" : "Edit"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={rejectCompassProposal}
                      >
                        Discard
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-6 px-2 text-[11px] gap-1"
                        onClick={acceptCompassProposal}
                      >
                        <Check className="h-3 w-3" />
                        Accept
                      </Button>
                    </div>
                  </div>
                  {compassProposal.note && (
                    <div className="text-[11px] italic text-muted-foreground">
                      {compassProposal.note}
                    </div>
                  )}
                  <div className="flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {compassProposal.scope === "selection"
                          ? "Selection diff"
                          : "Diff"}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/60" />
                          added
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-sm bg-rose-500/60" />
                          removed
                        </span>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-auto rounded border border-border bg-background/40 p-2">
                      <DiffView
                        base={
                          compassProposal.scope === "selection"
                            ? compassProposal.selection.originalText
                            : compassProposal.baseContent
                        }
                        proposed={compassDraft}
                      />
                    </div>
                    {compassEditing && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Edit proposal
                          </div>
                          {compassDraft !== compassProposal.proposedContent && (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                              onClick={() =>
                                setCompassDraft(compassProposal.proposedContent)
                              }
                            >
                              Reset to Compass
                            </button>
                          )}
                        </div>
                        <textarea
                          value={compassDraft}
                          onChange={(e) => setCompassDraft(e.target.value)}
                          rows={Math.min(
                            12,
                            Math.max(4, compassDraft.split("\n").length + 1),
                          )}
                          className="w-full bg-background/60 border border-border rounded px-2 py-1.5 text-[12px] font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                          placeholder="Tweak the proposed text..."
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          </>
          )}
          <div className="flex-1 p-4 overflow-y-auto relative">
            <textarea
              ref={textareaRef}
              className="w-full h-full bg-transparent border-none focus:ring-0 resize-none text-sm text-foreground/90 leading-relaxed"
              value={content}
              onChange={(e) => {
                handleContentChange(e);
                updateSelectionFromTextarea();
              }}
              onKeyDown={onContentKeyDown}
              onSelect={updateSelectionFromTextarea}
              onMouseUp={updateSelectionFromTextarea}
              onKeyUp={updateSelectionFromTextarea}
              readOnly={readOnly}
              placeholder={readOnly ? "" : "Start writing... type @ to link another node, use the toolbar for formatting"}
            />
            {mention && mentionMatches.length > 0 && (
              <div className="absolute left-3 bottom-3 z-50 w-64 max-h-56 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-2xl">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Link a node
                </div>
                {mentionMatches.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent/50 ${
                      i === mentionIdx ? "bg-accent/60" : ""
                    }`}
                    onMouseEnter={() => setMentionIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(m);
                    }}
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle"
                      style={{ backgroundColor: m.color || "hsl(var(--primary))" }}
                    />
                    {m.title}
                    <span className="ml-2 text-[10px] text-muted-foreground">{m.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-2 border-t border-border flex flex-wrap items-center gap-1 bg-muted/10">
            {(node.tags ?? []).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="group px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-destructive/20 hover:text-destructive transition-colors"
                title="Click to remove"
              >
                #{tag}
                <span className="ml-1 opacity-0 group-hover:opacity-100">×</span>
              </button>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTag();
                }
              }}
              onBlur={commitTag}
              placeholder="+ tag"
              className="bg-transparent border-none focus:ring-0 text-xs text-muted-foreground placeholder:text-muted-foreground/60 w-16 min-w-0"
            />
          </div>
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3 !border-2 !border-background" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3 !border-2 !border-background" />
    </div>
    </motion.div>
  );
});
