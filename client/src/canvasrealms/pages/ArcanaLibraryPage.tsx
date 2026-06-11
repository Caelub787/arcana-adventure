import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  arcanaSessionHostAdapter,
  ItemDialog,
  SpellDialog,
  SpeciesDialog,
  ClassDialog,
  FeatTreeDialog,
  type HostAdapter,
} from "@arcana/library-dialogs";
import "@arcana/library-dialogs/theme.css";
import type { SyncKind } from "@arcana/aa-sync-sdk";
import { toast } from "sonner";
import { Loader2, Plus, ArrowLeft, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { Button } from "@cr/components/ui/button";
import { useGetRealm, getGetRealmQueryKey } from "@workspace/api-client-react";
import { createArcanaLibraryTransport } from "@cr/lib/arcanaLibraryTransport";
import { ARCANA_SYSTEM_OPTIONS } from "@cr/lib/arcanaSystems";

interface KindTab {
  kind: SyncKind;
  label: string;
  Dialog: React.ComponentType<any>;
}

const KIND_TABS: KindTab[] = [
  { kind: "item", label: "Items", Dialog: ItemDialog },
  { kind: "spell", label: "Spells", Dialog: SpellDialog },
  { kind: "species", label: "Species", Dialog: SpeciesDialog },
  { kind: "class", label: "Classes", Dialog: ClassDialog },
  { kind: "feat-tree", label: "Feat trees", Dialog: FeatTreeDialog },
];

interface LibraryRow {
  id: string;
  externalId?: string | null;
  name?: string;
  data?: Record<string, unknown>;
}

export function ArcanaLibraryPage() {
  const [, params] = useRoute("/app/realm/:realmId/library");
  const [, setLocation] = useLocation();
  const realmId = params?.realmId ?? "";
  const queryClient = useQueryClient();
  const { data: realm, isLoading: realmLoading } = useGetRealm(realmId, {
    query: { enabled: !!realmId, queryKey: getGetRealmQueryKey(realmId) },
  });
  const arcanaLinked = !!(realm as unknown as { arcanaLinked?: boolean })
    ?.arcanaLinked;
  const realmSystem =
    (realm as unknown as { arcanaSystem?: string | null })?.arcanaSystem ||
    "aa-v2";
  const realmSystemLabel =
    ARCANA_SYSTEM_OPTIONS.find((o) => o.value === realmSystem)?.label ??
    realmSystem;

  const [activeKind, setActiveKind] = useState<SyncKind>("item");
  const [editing, setEditing] = useState<LibraryRow | null>(null);
  const [creating, setCreating] = useState(false);

  const transport = useMemo(
    () => (realmId ? createArcanaLibraryTransport(realmId) : null),
    [realmId],
  );

  const host: HostAdapter | null = useMemo(() => {
    if (!transport) return null;
    return arcanaSessionHostAdapter({
      transport,
      notify: (level, message) => {
        if (level === "error") toast.error(message);
        else if (level === "warning") toast.warning(message);
        else if (level === "success") toast.success(message);
        else toast(message);
      },
    });
  }, [transport]);

  const listKey = ["arcana-library", realmId, activeKind] as const;
  const listQuery = useQuery({
    queryKey: listKey,
    enabled: !!realmId && arcanaLinked,
    queryFn: async () => {
      if (!transport) return { data: [] as LibraryRow[] };
      const out = await transport.list<Record<string, unknown>>(activeKind);
      const rows = (out?.data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const data = (r["data"] as Record<string, unknown> | undefined) ?? r;
        return {
          id: String(r["id"] ?? data["id"] ?? ""),
          externalId: (r["externalId"] as string | null | undefined) ?? null,
          name:
            (data["name"] as string | undefined) ??
            (data["title"] as string | undefined) ??
            "(unnamed)",
          data,
        } satisfies LibraryRow;
      });
      return { data: rows };
    },
  });

  const onSaved = () => {
    setEditing(null);
    setCreating(false);
    queryClient.invalidateQueries({ queryKey: listKey });
  };

  const onDelete = async (row: LibraryRow) => {
    if (!transport || !row.id) return;
    if (!window.confirm(`Delete "${row.name}"? This will also remove it from Arcana.`)) {
      return;
    }
    try {
      await transport.delete(activeKind, row.id);
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: listKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!realmId) {
    return null;
  }

  const ActiveDialog = KIND_TABS.find((t) => t.kind === activeKind)?.Dialog;

  return (
    <div data-ld-root className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(`/app/realm/${realmId}`)}
          title="Back to realm"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Arcana library
          </div>
          <div className="text-sm font-medium truncate">
            {realmLoading ? "Loading…" : realm?.name ?? "Realm"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => listQuery.refetch()}
          disabled={listQuery.isFetching || !arcanaLinked}
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
        {arcanaLinked && (
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            New {KIND_TABS.find((t) => t.kind === activeKind)?.label.replace(/s$/, "").toLowerCase()}
          </Button>
        )}
      </header>

      <nav className="flex gap-1 px-4 pt-3 border-b border-border overflow-x-auto">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            onClick={() => setActiveKind(tab.kind)}
            className={`px-3 py-1.5 text-sm rounded-t-md whitespace-nowrap border-b-2 transition-colors ${
              activeKind === tab.kind
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-4">
        {!arcanaLinked && !realmLoading && (
          <div className="max-w-md mx-auto mt-12 p-6 rounded-lg border border-border bg-muted/10 text-center">
            <div className="text-sm font-medium mb-2">This realm isn't linked to Arcana yet.</div>
            <div className="text-xs text-muted-foreground">
              Link it from the realm's Arcana settings to start managing its library here.
            </div>
          </div>
        )}

        {arcanaLinked && listQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading {activeKind}…
          </div>
        )}

        {arcanaLinked && listQuery.isError && (
          <div className="text-sm text-destructive">
            Couldn't load {activeKind}: {(listQuery.error as Error)?.message}
          </div>
        )}

        {arcanaLinked && listQuery.data && (
          <div className="space-y-1">
            {listQuery.data.data.length === 0 && (
              <div className="text-sm text-muted-foreground italic">
                No {activeKind} entries yet. Click "New" to create one.
              </div>
            )}
            {listQuery.data.data.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent/20"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{row.name}</div>
                  {row.externalId && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      external: {row.externalId}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(row)}
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(row)}
                  title="Delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>

      {host && ActiveDialog && (
        <>
          {creating && (
            <ActiveDialog
              mode="create"
              open={creating}
              onOpenChange={(o: boolean) => !o && setCreating(false)}
              host={host}
              campaignSystem={realmSystem}
              systemName={realmSystemLabel}
              onSaved={onSaved}
            />
          )}
          {editing && (
            <ActiveDialog
              mode="edit"
              open={!!editing}
              onOpenChange={(o: boolean) => !o && setEditing(null)}
              host={host}
              campaignSystem={realmSystem}
              systemName={realmSystemLabel}
              initialValue={{ ...(editing.data ?? {}), id: editing.id }}
              onSaved={onSaved}
            />
          )}
        </>
      )}
    </div>
  );
}

export default ArcanaLibraryPage;
