import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ItemDialog,
  SpellDialog,
  SpeciesDialog,
  FeatTreeDialog,
  CharacterTemplateDialog,
  RollTemplateDialog,
  arcanaSessionHostAdapter,
  type HostAdapter,
  type LibraryTransport,
} from "@arcana/library-dialogs";
import type { SyncKind } from "@arcana/aa-sync-sdk";
import "@arcana/library-dialogs/theme.css";
import {
  arcanaApiTransport,
  useImageBrowserBridge,
  ArcanaModalChrome,
  itemToDraft,
} from "@/lib/library-dialog-bridges";
import { createArcanaApiTransport } from "@/lib/libraryDialogsHost";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";

type LibKind = Extract<
  SyncKind,
  "item" | "spell" | "species" | "feat-tree" | "character-template" | "roll-template"
>;

const KIND_LABELS: Record<LibKind, string> = {
  item: "Items",
  spell: "Spells",
  species: "Species",
  "feat-tree": "Feat Trees",
  "character-template": "Char Templates",
  "roll-template": "Roll Templates",
};

const GM_KINDS: LibKind[] = [
  "item",
  "spell",
  "species",
  "feat-tree",
  "character-template",
  "roll-template",
];
const PLAYER_KINDS: LibKind[] = ["item"];

// Supported library systems and their canonical display labels. The display
// label is what the species transport and create routes expect (V2/V3 species
// are resolved by label, e.g. "A.A. V3"), while the slug is what item/feat/
// class routes use.
const SYSTEM_OPTIONS: { slug: string; label: string }[] = [
  { slug: "arcana-adventure", label: "Arcana Adventure" },
  { slug: "aa-v2", label: "A.A. V2" },
  { slug: "aa-v3", label: "A.A. V3" },
];
const SYSTEM_SLUGS = SYSTEM_OPTIONS.map((s) => s.slug);
function systemLabelFor(slug: string): string {
  return SYSTEM_OPTIONS.find((s) => s.slug === slug)?.label ?? "Arcana Adventure";
}
// Roll Templates are an AA V2 / V3 only concept; the base system has none.
function kindsForSystem(base: LibKind[], slug: string): LibKind[] {
  const isAaV2OrV3 = slug === "aa-v2" || slug === "aa-v3";
  return isAaV2OrV3 ? base : base.filter((k) => k !== "roll-template");
}

// Kinds whose transport supports get-by-id hydration (so the edit dialog can
// load full nested data). Spell / roll-template have no get-by-id endpoint, so
// editing those happens in the dedicated admin library instead.
const EDITABLE_KINDS: LibKind[] = [
  "item",
  "species",
  "feat-tree",
  "character-template",
];

const LIST_KEY: Record<LibKind, string> = {
  item: "system-items",
  spell: "system-spells",
  species: "system-species",
  "feat-tree": "feat-trees",
  "character-template": "character-templates",
  "roll-template": "item-templates",
};

function invalidateAll() {
  for (const key of Object.values(LIST_KEY)) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

interface MyLibraryPanelProps {
  campaignSystem?: string;
  isGM: boolean;
}

export function MyLibraryPanel({ campaignSystem, isGM }: MyLibraryPanelProps) {
  const { toast } = useToast();

  const defaultSlug =
    campaignSystem && SYSTEM_SLUGS.includes(campaignSystem)
      ? campaignSystem
      : "arcana-adventure";
  const [systemSlug, setSystemSlug] = useState<string>(defaultSlug);

  const kinds = useMemo(
    () => kindsForSystem(isGM ? GM_KINDS : PLAYER_KINDS, systemSlug),
    [isGM, systemSlug],
  );

  const [activeKind, setActiveKind] = useState<LibKind>(kinds[0]);
  const [dialog, setDialog] = useState<{
    kind: LibKind;
    mode: "create" | "edit";
    value?: any;
  } | null>(null);

  // If switching systems removes the currently-selected kind (e.g. roll-template
  // when moving to the base system), fall back to the first available kind.
  useEffect(() => {
    if (!kinds.includes(activeKind)) {
      setActiveKind(kinds[0]);
    }
  }, [kinds, activeKind]);

  const systemDisplayName = systemLabelFor(systemSlug);

  const { imagePicker, element: imageBrowserElement } = useImageBrowserBridge();

  // Item uses the rich bridge transport (full get/upsert/patch incl. nested
  // rolls, recipes, template links). All other kinds use the shared
  // session-cookie transport.
  const transport = useMemo<LibraryTransport>(() => {
    const itemTransport = arcanaApiTransport(systemSlug, true);
    const baseTransport = createArcanaApiTransport({
      systemSlug,
      systemDisplayName,
      personal: true,
    });
    const pick = (kind: SyncKind) =>
      kind === "item" ? itemTransport : baseTransport;
    return {
      list: (kind) => pick(kind).list(kind),
      get: (kind, id) => pick(kind).get(kind, id),
      upsert: async (kind, body) => {
        const env = await pick(kind).upsert(kind, body);
        invalidateAll();
        return env;
      },
      patch: async (kind, id, body) => {
        const env = await pick(kind).patch(kind, id, body);
        invalidateAll();
        return env;
      },
      delete: async (kind, id) => {
        const r = await pick(kind).delete(kind, id);
        invalidateAll();
        return r;
      },
    };
  }, [systemSlug, systemDisplayName]);

  const host = useMemo<HostAdapter>(
    () =>
      arcanaSessionHostAdapter({
        transport,
        notify: (level, message) =>
          toast({
            title:
              level === "error"
                ? "Error"
                : level === "warning"
                ? "Warning"
                : "Notice",
            description: message,
            variant: level === "error" ? "destructive" : "default",
          }),
        imagePicker,
        modal: ArcanaModalChrome,
      }),
    [transport, imagePicker, toast],
  );

  const { data: entries = [], isLoading } = useQuery({
    queryKey: [LIST_KEY[activeKind], systemSlug, activeKind],
    queryFn: async () => {
      const r = await transport.list<any>(activeKind);
      return r.data;
    },
  });

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await transport.delete(activeKind, id);
      toast({ title: "Deleted", description: `"${name}" was removed.` });
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const openEdit = (row: any) => {
    setDialog({
      kind: activeKind,
      mode: "edit",
      value: activeKind === "item" ? itemToDraft(row) : row,
    });
  };

  const closeDialog = () => setDialog(null);

  return (
    <div className="flex flex-col h-full p-3 gap-3" data-testid="my-library-panel">
      {/* System switcher */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-400 uppercase font-bold">System</span>
        <Select value={systemSlug} onValueChange={(v) => setSystemSlug(v)}>
          <SelectTrigger
            className="h-8 w-[120px] bg-stone-900 border-stone-700 text-stone-200 text-sm"
            data-testid="select-library-system"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-stone-900 border-stone-700">
            {SYSTEM_OPTIONS.map((opt) => (
              <SelectItem key={opt.slug} value={opt.slug}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kind tabs */}
      <div className="flex flex-wrap gap-1">
        {kinds.map((kind) => (
          <Button
            key={kind}
            variant={activeKind === kind ? "default" : "outline"}
            size="sm"
            className={
              activeKind === kind
                ? "h-7 bg-amber-700 hover:bg-amber-600 text-xs"
                : "h-7 border-stone-600 text-stone-300 text-xs"
            }
            onClick={() => setActiveKind(kind)}
            data-testid={`tab-library-${kind}`}
          >
            {KIND_LABELS[kind]}
          </Button>
        ))}
      </div>

      <Button
        onClick={() => setDialog({ kind: activeKind, mode: "create" })}
        className="w-full bg-stone-700 hover:bg-stone-600"
        data-testid={`button-create-${activeKind}`}
      >
        <Plus className="h-4 w-4 mr-2" />
        New {KIND_LABELS[activeKind].replace(/s$/, "")}
      </Button>

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {isLoading ? (
            <p className="text-center text-stone-500 text-sm py-4">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-stone-500 text-sm py-4">
              Nothing here yet. Create your first {KIND_LABELS[activeKind].replace(/s$/, "").toLowerCase()}.
            </p>
          ) : (
            entries.map((row: any) => {
              const name = row.name || row.displayName || "Unnamed";
              return (
                <div
                  key={row.id}
                  className="flex items-center gap-2 p-2 bg-stone-800 rounded border border-stone-700"
                  data-testid={`library-row-${row.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-200 truncate">{name}</p>
                  </div>
                  {EDITABLE_KINDS.includes(activeKind) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-stone-400 hover:text-white shrink-0"
                      onClick={() => openEdit(row)}
                      data-testid={`button-edit-${row.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => handleDelete(row.id, name)}
                    data-testid={`button-delete-${row.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Dialogs */}
      {dialog?.kind === "item" && (
        <ItemDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          mode={dialog.mode}
          initialValue={dialog.value}
          host={host}
          campaignSystem={systemSlug}
          onSaved={closeDialog}
        />
      )}
      {dialog?.kind === "spell" && (
        <SpellDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          mode={dialog.mode}
          initialValue={dialog.value}
          host={host}
          campaignSystem={systemSlug}
          onSaved={closeDialog}
        />
      )}
      {dialog?.kind === "species" && (
        <SpeciesDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          mode={dialog.mode}
          initialValue={dialog.value}
          host={host}
          campaignSystem={systemSlug}
          onSaved={closeDialog}
        />
      )}
      {dialog?.kind === "feat-tree" && (
        <FeatTreeDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          mode={dialog.mode}
          initialValue={dialog.value}
          host={host}
          campaignSystem={systemSlug}
          onSaved={closeDialog}
        />
      )}
      {dialog?.kind === "character-template" && (
        <CharacterTemplateDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          mode={dialog.mode}
          initialValue={dialog.value}
          host={host}
          campaignSystem={systemSlug}
          onSaved={closeDialog}
        />
      )}
      {dialog?.kind === "roll-template" && (
        <RollTemplateDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          mode={dialog.mode}
          initialValue={dialog.value}
          host={host}
          campaignSystem={systemSlug}
          onSaved={closeDialog}
        />
      )}

      {imageBrowserElement}
    </div>
  );
}
