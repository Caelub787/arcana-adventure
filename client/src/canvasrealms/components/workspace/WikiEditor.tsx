import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useGetWikiDraft,
  useUpdateWikiDraft,
  usePublishWiki,
  useUnpublishWiki,
  useListWikiSnapshots,
  useRevertWikiSnapshot,
  useListNodes,
  getGetWikiDraftQueryKey,
  getListWikiSnapshotsQueryKey,
  getListNodesQueryKey,
  type WikiDraft,
  type WikiEntry,
  type WikiSection,
  type WikiTheme,
  type WikiEntrySize,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { Button } from "@cr/components/ui/button";
import { Input } from "@cr/components/ui/input";
import { Textarea } from "@cr/components/ui/textarea";
import { Switch } from "@cr/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cr/components/ui/select";
import { Checkbox } from "@cr/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cr/components/ui/alert-dialog";
import {
  Loader2,
  Globe,
  Copy,
  History,
  EyeOff,
  Check,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const SIZES: WikiEntrySize[] = ["small", "medium", "large", "full"];
const UNSECTIONED = "__unsectioned__";

function defaultEntry(nodeId: string, order: number): WikiEntry {
  return {
    nodeId,
    order,
    sectionId: null,
    size: "medium",
    // The image toggle exposes the first image URL found in the node's
    // markdown content (`![alt](url)`) on the public page.
    show: { title: true, summary: true, content: false, image: true },
  };
}

function makeId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export function WikiEditor() {
  const { activeRealmId } = useAppStore();
  const role = useRealmRole(activeRealmId);
  const realmId = activeRealmId || "";
  const qc = useQueryClient();

  const { data: state, isLoading } = useGetWikiDraft(realmId, {
    query: {
      enabled: !!realmId,
      queryKey: getGetWikiDraftQueryKey(realmId),
    },
  });
  const { data: nodes } = useListNodes(realmId, {
    query: {
      enabled: !!realmId,
      queryKey: getListNodesQueryKey(realmId),
    },
  });
  const { data: snapshots } = useListWikiSnapshots(realmId, {
    query: {
      enabled: !!realmId,
      queryKey: getListWikiSnapshotsQueryKey(realmId),
    },
  });

  const updateDraft = useUpdateWikiDraft();
  const publish = usePublishWiki();
  const unpublish = useUnpublishWiki();
  const revert = useRevertWikiSnapshot();

  // Local working copy of the draft. We mirror server state into it on load
  // (and after server-side prunes/reverts), then debounce-PUT changes back.
  const [draft, setDraft] = useState<WikiDraft | null>(null);
  const lastServerJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const json = JSON.stringify(state.draft);
    if (json !== lastServerJsonRef.current) {
      lastServerJsonRef.current = json;
      setDraft(state.draft);
    }
  }, [state]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const flushSave = useCallback(
    (next: WikiDraft) => {
      if (!realmId || !role.canEdit) return;
      updateDraft.mutate(
        { realmId, data: next },
        {
          onSuccess: () => {
            setSavedAt(Date.now());
            lastServerJsonRef.current = JSON.stringify(next);
            qc.invalidateQueries({ queryKey: getGetWikiDraftQueryKey(realmId) });
          },
          onError: (e) => {
            toast.error(`Failed to save wiki: ${(e as Error).message}`);
          },
        },
      );
    },
    [realmId, role.canEdit, updateDraft, qc],
  );

  const scheduleSave = useCallback(
    (next: WikiDraft) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => flushSave(next), 600);
    },
    [flushSave],
  );

  const update = useCallback(
    (updater: (d: WikiDraft) => WikiDraft) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // Flush on unmount so quick navigations don't drop in-flight edits.
  const draftRef = useRef<WikiDraft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        const cur = draftRef.current;
        if (cur && lastServerJsonRef.current !== JSON.stringify(cur)) {
          flushSave(cur);
        }
      }
    },
    [flushSave],
  );

  const wikiUrl = useMemo(() => {
    if (!state?.slug) return "";
    if (typeof window === "undefined") return `/wiki/${state.slug}`;
    return `${window.location.origin}/wiki/${state.slug}`;
  }, [state?.slug]);

  const handleCopy = async () => {
    if (!wikiUrl) return;
    try {
      await navigator.clipboard.writeText(wikiUrl);
      toast.success("Public link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  // Reorder helper: move an entry up or down in its section's order.
  const moveEntry = useCallback(
    (nodeId: string, dir: -1 | 1) => {
      update((d) => {
        const sorted = [...d.entries].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((e) => e.nodeId === nodeId);
        if (idx < 0) return d;
        const target = idx + dir;
        if (target < 0 || target >= sorted.length) return d;
        // Only swap within the same section.
        if (sorted[idx]!.sectionId !== sorted[target]!.sectionId) return d;
        const [a, b] = [sorted[idx]!, sorted[target]!];
        const swapped = sorted.map((e) => {
          if (e.nodeId === a.nodeId) return { ...e, order: b.order };
          if (e.nodeId === b.nodeId) return { ...e, order: a.order };
          return e;
        });
        return { ...d, entries: swapped };
      });
    },
    [update],
  );

  if (!realmId) return null;
  if (isLoading || !draft || !state) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canEdit = role.canEdit;
  const hasPublished = state.isPublished;
  const sortedEntries = [...draft.entries].sort((a, b) => a.order - b.order);
  const sectionsWithUnsectioned = [
    { id: UNSECTIONED, title: "Ungrouped" },
    ...draft.sections,
  ];

  const doPublish = () => {
    setConfirmPublishOpen(false);
    publish.mutate(
      { realmId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetWikiDraftQueryKey(realmId) });
          qc.invalidateQueries({
            queryKey: getListWikiSnapshotsQueryKey(realmId),
          });
          toast.success(
            hasPublished ? "New version published" : "Wiki published",
          );
        },
      },
    );
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Status banner */}
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-primary" />
            <span className="font-medium">
              {hasPublished ? "Published" : "Not published"}
            </span>
            {state.hasUnpublishedChanges && hasPublished && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">
                Unpublished changes
              </span>
            )}
          </div>
          {wikiUrl && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent/40"
                title={
                  hasPublished
                    ? wikiUrl
                    : `${wikiUrl} (will become live once you publish)`
                }
              >
                <Copy className="w-3 h-3" />
                <span className="font-mono truncate max-w-[40ch]">{wikiUrl}</span>
              </button>
              <a
                href={wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                {hasPublished ? "Open public view" : "Preview public URL"}
              </a>
              <span
                className="text-[11px] text-muted-foreground"
                title="The slug in this URL is fixed when the realm is created and cannot be changed later, so this link stays stable for anyone you share it with."
              >
                (permanent URL)
              </span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {savedAt && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> Draft saved
              </span>
            )}
            {canEdit && (
              <>
                {hasPublished && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      unpublish.mutate(
                        { realmId },
                        {
                          onSuccess: () => {
                            qc.invalidateQueries({
                              queryKey: getGetWikiDraftQueryKey(realmId),
                            });
                            qc.invalidateQueries({
                              queryKey: getListWikiSnapshotsQueryKey(realmId),
                            });
                            toast.success("Wiki unpublished");
                          },
                        },
                      )
                    }
                    disabled={unpublish.isPending}
                  >
                    <EyeOff className="w-4 h-4 mr-1.5" />
                    Unpublish
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setConfirmPublishOpen(true)}
                  disabled={publish.isPending}
                >
                  {publish.isPending && (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  )}
                  {hasPublished ? "Publish update" : "Publish"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Page settings */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Page
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium">Title</label>
              <Input
                value={draft.title}
                disabled={!canEdit}
                onChange={(e) =>
                  update((d) => ({ ...d, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium">Tagline</label>
              <Textarea
                rows={2}
                value={draft.tagline ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  update((d) => ({ ...d, tagline: e.target.value || null }))
                }
                placeholder="A short subtitle shown under the title."
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium">Cover image URL</label>
              <Input
                value={draft.coverImage ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  update((d) => ({ ...d, coverImage: e.target.value || null }))
                }
                placeholder="https://… or /api/storage/objects/…"
              />
              {draft.coverImage && (
                <img
                  src={draft.coverImage}
                  alt=""
                  className="mt-2 h-20 rounded border border-border/40 object-cover"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Theme</label>
              <Select
                value={draft.theme}
                onValueChange={(v) =>
                  update((d) => ({ ...d, theme: v as WikiTheme }))
                }
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.showSidebar}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    update((d) => ({ ...d, showSidebar: v }))
                  }
                />
                <span className="text-sm">Show navigation sidebar</span>
              </div>
            </div>
            <div className="space-y-1.5 flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!draft.freeLayout}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    update((d) => ({ ...d, freeLayout: v }))
                  }
                />
                <span className="text-sm">Free layout (drag to position)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sections editor */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Sections
            </h2>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update((d) => ({
                    ...d,
                    sections: [
                      ...d.sections,
                      { id: makeId(), title: "New section" } satisfies WikiSection,
                    ],
                  }))
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add section
              </Button>
            )}
          </div>
          {draft.sections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No sections yet. Entries will appear in a single ungrouped list.
            </p>
          ) : (
            <div className="space-y-2">
              {draft.sections.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Input
                    value={s.title}
                    disabled={!canEdit}
                    onChange={(e) =>
                      update((d) => ({
                        ...d,
                        sections: d.sections.map((x) =>
                          x.id === s.id ? { ...x, title: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        update((d) => ({
                          ...d,
                          sections: d.sections.filter((x) => x.id !== s.id),
                          // Move entries from this section back to "ungrouped"
                          // so they don't disappear.
                          entries: d.entries.map((e) =>
                            e.sectionId === s.id ? { ...e, sectionId: null } : e,
                          ),
                        }))
                      }
                      title="Delete section"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Free-layout positioning canvas */}
        {draft.freeLayout && (
          <FreeLayoutEditorCanvas
            draft={draft}
            nodes={nodes ?? []}
            canEdit={canEdit}
            update={update}
          />
        )}

        {/* Entries */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Content
            </h2>
            <span className="text-xs text-muted-foreground">
              {draft.entries.length} of {nodes?.length ?? 0} included
            </span>
          </div>

          <div className="rounded-lg border border-border/60 divide-y divide-border/40">
            {(nodes ?? []).map((n) => {
              const entry = draft.entries.find((e) => e.nodeId === n.id);
              const included = !!entry;
              return (
                <div
                  key={n.id}
                  className="p-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Checkbox
                      checked={included}
                      disabled={!canEdit}
                      onCheckedChange={(v) =>
                        update((d) => {
                          if (v) {
                            return {
                              ...d,
                              entries: [
                                ...d.entries,
                                defaultEntry(n.id, d.entries.length),
                              ],
                            };
                          }
                          return {
                            ...d,
                            entries: d.entries.filter((e) => e.nodeId !== n.id),
                          };
                        })
                      }
                    />
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: n.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {n.title || "Untitled"}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {n.kind}
                      </div>
                    </div>
                  </div>
                  {included && entry && (
                    <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                      <Select
                        value={entry.sectionId ?? UNSECTIONED}
                        onValueChange={(v) =>
                          update((d) => ({
                            ...d,
                            entries: d.entries.map((e) =>
                              e.nodeId === n.id
                                ? {
                                    ...e,
                                    sectionId: v === UNSECTIONED ? null : v,
                                  }
                                : e,
                            ),
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="h-7 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sectionsWithUnsectioned.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={entry.size}
                        onValueChange={(v) =>
                          update((d) => ({
                            ...d,
                            entries: d.entries.map((e) =>
                              e.nodeId === n.id
                                ? { ...e, size: v as WikiEntrySize }
                                : e,
                            ),
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="h-7 w-[100px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIZES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <ShowToggle
                        label="Title"
                        checked={entry.show.title}
                        disabled={!canEdit}
                        onChange={(v) =>
                          update((d) => ({
                            ...d,
                            entries: d.entries.map((e) =>
                              e.nodeId === n.id
                                ? { ...e, show: { ...e.show, title: v } }
                                : e,
                            ),
                          }))
                        }
                      />
                      <ShowToggle
                        label="Summary"
                        checked={entry.show.summary}
                        disabled={!canEdit}
                        onChange={(v) =>
                          update((d) => ({
                            ...d,
                            entries: d.entries.map((e) =>
                              e.nodeId === n.id
                                ? { ...e, show: { ...e.show, summary: v } }
                                : e,
                            ),
                          }))
                        }
                      />
                      <ShowToggle
                        label="Body"
                        checked={entry.show.content}
                        disabled={!canEdit}
                        onChange={(v) =>
                          update((d) => ({
                            ...d,
                            entries: d.entries.map((e) =>
                              e.nodeId === n.id
                                ? { ...e, show: { ...e.show, content: v } }
                                : e,
                            ),
                          }))
                        }
                      />
                      <ShowToggle
                        label="Image"
                        checked={entry.show.image}
                        disabled={!canEdit}
                        onChange={(v) =>
                          update((d) => ({
                            ...d,
                            entries: d.entries.map((e) =>
                              e.nodeId === n.id
                                ? { ...e, show: { ...e.show, image: v } }
                                : e,
                            ),
                          }))
                        }
                      />
                      {canEdit && (
                        <div className="flex">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveEntry(n.id, -1)}
                            title="Move up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveEntry(n.id, 1)}
                            title="Move down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {(!nodes || nodes.length === 0) && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Add nodes to your realm to include them in the wiki.
              </div>
            )}
          </div>
        </section>

        {/* History */}
        {snapshots && snapshots.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Publish history
            </h2>
            <div className="rounded-lg border border-border/60 divide-y divide-border/40">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="p-3 flex items-center gap-3 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(s.publishedAt).toLocaleString()}
                      {s.publishedByUserId && (
                        <>
                          {" · by "}
                          <span className="font-mono">
                            {s.publishedByUserId.slice(0, 8)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {s.isLive && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                      Live
                    </span>
                  )}
                  {canEdit && !s.isLive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        revert.mutate(
                          { realmId, snapshotId: s.id },
                          {
                            onSuccess: () => {
                              qc.invalidateQueries({
                                queryKey: getGetWikiDraftQueryKey(realmId),
                              });
                              qc.invalidateQueries({
                                queryKey:
                                  getListWikiSnapshotsQueryKey(realmId),
                              });
                              toast.success("Reverted to this version");
                            },
                          },
                        )
                      }
                    >
                      Revert
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Publish confirmation */}
      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasPublished ? "Publish a new version?" : "Publish wiki?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasPublished
                ? "This will replace the live version at the public URL."
                : "This will make your wiki publicly accessible to anyone with the link."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title</span>
              <span className="font-medium truncate ml-4">{draft.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entries</span>
              <span>{sortedEntries.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sections</span>
              <span>{draft.sections.length}</span>
            </div>
            {wikiUrl && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">URL</span>
                <span className="font-mono text-xs truncate ml-4">{wikiUrl}</span>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doPublish}>
              {hasPublished ? "Publish update" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShowToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="text-[11px] inline-flex items-center gap-1 cursor-pointer">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(!!v)}
        className="h-3.5 w-3.5"
      />
      {label}
    </label>
  );
}

interface MinNode {
  id: string;
  title: string;
  color: string;
}

function FreeLayoutEditorCanvas({
  draft,
  nodes,
  canEdit,
  update,
}: {
  draft: WikiDraft;
  nodes: MinNode[];
  canEdit: boolean;
  update: (fn: (d: WikiDraft) => WikiDraft) => void;
}) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const CARD_W = 220;
  const CARD_H = 100;
  const CANVAS_H = 600;

  function ensurePosition(nodeId: string, idx: number) {
    const e = draft.entries.find((x) => x.nodeId === nodeId);
    if (e?.position) return e.position;
    const cols = 4;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      x: 24 + col * (CARD_W + 16),
      y: 24 + row * (CARD_H + 16),
      w: CARD_W,
      h: CARD_H,
    };
  }

  function onPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    nodeId: string,
    pos: { x: number; y: number; w: number; h: number },
  ) {
    if (!canEdit) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = pos.x;
    const origY = pos.y;
    const onMove = (ev: PointerEvent) => {
      const nx = Math.max(0, origX + (ev.clientX - startX));
      const ny = Math.max(0, origY + (ev.clientY - startY));
      update((d) => ({
        ...d,
        entries: d.entries.map((entry) =>
          entry.nodeId === nodeId
            ? {
                ...entry,
                position: { x: nx, y: ny, w: pos.w, h: pos.h },
              }
            : entry,
        ),
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Layout canvas
        </h2>
        <span className="text-xs text-muted-foreground">
          Drag cards to position them on the public page.
        </span>
      </div>
      <div
        className="relative w-full rounded-lg border border-dashed border-border/60 bg-muted/10 overflow-auto"
        style={{ height: CANVAS_H }}
      >
        {draft.entries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Include nodes below to start positioning them.
          </div>
        )}
        {draft.entries.map((entry, idx) => {
          const n = nodeById.get(entry.nodeId);
          if (!n) return null;
          const pos = entry.position ?? ensurePosition(entry.nodeId, idx);
          return (
            <div
              key={entry.nodeId}
              onPointerDown={(e) => onPointerDown(e, entry.nodeId, pos)}
              className={`absolute rounded border border-border/70 bg-card/80 shadow-sm p-2 text-xs ${
                canEdit ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              style={{
                left: pos.x,
                top: pos.y,
                width: pos.w,
                height: pos.h,
              }}
              title={n.title}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: n.color }}
                  aria-hidden
                />
                <span className="truncate font-medium">
                  {n.title || "Untitled"}
                </span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {pos.w}×{pos.h} @ {Math.round(pos.x)},{Math.round(pos.y)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
