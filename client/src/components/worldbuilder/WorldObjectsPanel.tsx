import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ItemDialog, SpellDialog, arcanaSessionHostAdapter } from '@arcana/library-dialogs';
import '@arcana/library-dialogs/theme.css';
import {
  arcanaApiTransport,
  ArcanaModalChrome,
  useImageBrowserBridge,
  itemToDraft,
} from '@/lib/library-dialog-bridges';
import { SpellbookLibraryManager } from '@/components/library/SpellbookLibraryManager';
import { CharacterSheet, ItemDetailDialog } from '@/components/game/GameComponents';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sword, Sparkles, Users, Plus, Eye, Pencil, Loader2, Download } from 'lucide-react';

type ObjTab = 'items' | 'spells' | 'characters';

type CampaignCharacterRef = { id: string; name: string };

function systemSlugFromWorld(system: string | null | undefined): 'aa-v2' | 'aa-v3' | 'arcana-adventure' {
  if (system === 'aa-v2') return 'aa-v2';
  if (system === 'aa-v3') return 'aa-v3';
  return 'arcana-adventure';
}

function systemDisplayFromSlug(slug: 'aa-v2' | 'aa-v3' | 'arcana-adventure'): string {
  if (slug === 'aa-v2') return 'A.A. V2';
  if (slug === 'aa-v3') return 'A.A. V3';
  return 'Arcana Adventure';
}

export function WorldObjectsPanel({
  worldId,
  system,
  canEdit,
  campaignId,
  campaignSystem,
  campaignCharacters,
  canImportCharacters,
}: {
  worldId: string;
  system: string | null | undefined;
  canEdit: boolean;
  campaignId?: string;
  campaignSystem?: string | null;
  campaignCharacters?: CampaignCharacterRef[];
  canImportCharacters?: boolean;
}) {
  const slug = systemSlugFromWorld(system);
  const display = systemDisplayFromSlug(slug);
  const queryClient = useQueryClient();

  // Campaign-import context: only available when this panel is embedded inside a
  // campaign whose linked world shares the same game system.
  const inCampaign = !!campaignId;
  const systemMatches = !campaignSystem || campaignSystem === slug;
  const canImport = inCampaign && systemMatches;
  const roster = campaignCharacters || [];

  const [tab, setTab] = useState<ObjTab>('items');

  // ---- Import-to-campaign state ----
  const [importObj, setImportObj] = useState<{ kind: 'item' | 'spell'; row: any } | null>(null);
  const [importTargetId, setImportTargetId] = useState<string>('');
  const [importing, setImporting] = useState(false);

  const handleImportItemOrSpell = async () => {
    if (!importObj || !campaignId || !importTargetId || importing) return;
    setImporting(true);
    try {
      if (importObj.kind === 'item') {
        await api.importWorldItem(campaignId, importObj.row.id, importTargetId);
      } else {
        await api.importWorldSpell(campaignId, importObj.row.id, importTargetId);
      }
      queryClient.invalidateQueries({ queryKey: ['items', importTargetId] });
      queryClient.invalidateQueries({ queryKey: ['spells', importTargetId] });
      toast({
        title: 'Imported',
        description: `"${importObj.row.name || 'Object'}" was added to the campaign.`,
      });
      setImportObj(null);
      setImportTargetId('');
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message || 'Could not import object', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleImportCharacter = async (row: any) => {
    if (!campaignId || importing) return;
    setImporting(true);
    try {
      await api.importWorldCharacter(campaignId, row.id);
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
      toast({ title: 'Imported', description: `"${row.name || 'Character'}" was added to the roster.` });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message || 'Could not import character', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const openImport = (kind: 'item' | 'spell', row: any) => {
    setImportObj({ kind, row });
    setImportTargetId(roster.length === 1 ? roster[0].id : '');
  };

  // ---- Queries ----
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['world-items', worldId],
    queryFn: () => api.getSystemItems(slug, undefined, undefined, worldId),
  });
  const { data: spells = [], isLoading: spellsLoading } = useQuery({
    queryKey: ['world-spells', worldId],
    queryFn: () => api.getSystemSpells(slug, undefined, worldId),
  });
  const { data: characters = [], isLoading: charactersLoading } = useQuery({
    queryKey: ['world-characters', worldId],
    queryFn: () => api.getCharacterTemplates(undefined, worldId),
  });
  const { data: allSpecies = [] } = useQuery({
    queryKey: ['world-species', display],
    queryFn: () => api.getSystemSpecies(display),
  });

  const invalidateItems = () => queryClient.invalidateQueries({ queryKey: ['world-items', worldId] });
  const invalidateSpells = () => queryClient.invalidateQueries({ queryKey: ['world-spells', worldId] });
  const invalidateCharacters = () => queryClient.invalidateQueries({ queryKey: ['world-characters', worldId] });

  // ---- Shared library-dialog host (world-scoped transport) ----
  const { imagePicker, element: imageBrowserElement } = useImageBrowserBridge();
  const transport = useMemo(() => arcanaApiTransport(slug, undefined, worldId), [slug, worldId]);
  const host = useMemo(
    () =>
      arcanaSessionHostAdapter({
        transport,
        notify: (level: string, message: string) =>
          toast({
            title: level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Notice',
            description: message,
            variant: level === 'error' ? 'destructive' : 'default',
          }),
        imagePicker,
        modal: ArcanaModalChrome,
        spellbookManager: SpellbookLibraryManager,
      }),
    [transport, imagePicker],
  );

  // ---- Dialog state ----
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [viewItem, setViewItem] = useState<any | null>(null);

  const [showCreateSpell, setShowCreateSpell] = useState(false);
  const [editSpell, setEditSpell] = useState<any | null>(null);
  const [viewSpell, setViewSpell] = useState<any | null>(null);

  const [viewChar, setViewChar] = useState<any | null>(null);
  const [showCreateChar, setShowCreateChar] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [creatingChar, setCreatingChar] = useState(false);

  const handleCreateChar = async () => {
    if (creatingChar) return;
    setCreatingChar(true);
    try {
      const created = await api.createCharacterTemplate({
        name: newCharName.trim() || 'New Character',
        worldId,
      } as any);
      setShowCreateChar(false);
      setNewCharName('');
      invalidateCharacters();
      setViewChar(created);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to create character', variant: 'destructive' });
    } finally {
      setCreatingChar(false);
    }
  };

  const tabs: { id: ObjTab; label: string; icon: typeof Sword }[] = [
    { id: 'items', label: 'Items', icon: Sword },
    { id: 'spells', label: 'Spells', icon: Sparkles },
    { id: 'characters', label: 'Characters', icon: Users },
  ];

  const renderList = (
    rows: any[],
    loading: boolean,
    emptyLabel: string,
    onOpen: (row: any) => void,
    testPrefix: string,
    importKind?: 'item' | 'spell' | 'character',
  ) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      );
    }
    if (rows.length === 0) {
      return <div className="py-12 text-center text-sm text-stone-500">{emptyLabel}</div>;
    }
    // Import button shows only when embedded in a matching-system campaign.
    // Characters require GM rights (canImportCharacters); items/spells need a
    // target character in the roster.
    const showImport =
      !!importKind && canImport &&
      (importKind === 'character'
        ? !!canImportCharacters
        : roster.length > 0);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 bg-stone-800/60 hover:bg-stone-700/60 border border-stone-700 rounded-md pr-1.5 transition-colors"
            data-testid={`card-${testPrefix}-${row.id}`}
          >
            <button
              onClick={() => onOpen(row)}
              className="flex items-center gap-3 text-left px-3 py-2 flex-1 min-w-0"
            >
              {row.icon ? (
                <img src={row.icon} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded bg-stone-700 flex items-center justify-center flex-shrink-0">
                  {canEdit ? <Pencil className="w-4 h-4 text-stone-400" /> : <Eye className="w-4 h-4 text-stone-400" />}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm text-stone-200 truncate" data-testid={`text-${testPrefix}-name-${row.id}`}>
                  {row.name || 'Untitled'}
                </div>
                {row.description ? (
                  <div className="text-xs text-stone-500 truncate">{row.description}</div>
                ) : null}
              </div>
            </button>
            {showImport && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 flex-shrink-0 text-amber-400 hover:text-amber-300"
                title="Import into campaign"
                disabled={importing}
                onClick={(e) => {
                  e.stopPropagation();
                  if (importKind === 'character') handleImportCharacter(row);
                  else openImport(importKind, row);
                }}
                data-testid={`button-import-${testPrefix}-${row.id}`}
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Synthetic, query-disabled character for read-only item viewing (id '' keeps
  // ItemDetailDialog's character-scoped queries disabled).
  const viewerCharacter = useMemo(
    () => ({ id: '', name: 'Viewer', isTemplate: true }) as any,
    [],
  );

  return (
    <div className="flex flex-col h-full" data-testid="panel-world-objects">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-stone-700 px-2 pt-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-md transition-colors ${
              tab === id
                ? 'bg-stone-800 text-amber-300 border border-b-0 border-stone-700'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            data-testid={`tab-world-${id}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <span
          className="ml-auto mr-1 mb-1 self-end text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30"
          data-testid="text-world-system"
        >
          {display}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Create button */}
        {canEdit && (
          <div className="mb-3">
            {tab === 'items' && (
              <Button size="sm" onClick={() => setShowCreateItem(true)} data-testid="button-create-world-item">
                <Plus className="w-4 h-4 mr-1" /> New Item
              </Button>
            )}
            {tab === 'spells' && (
              <Button size="sm" onClick={() => setShowCreateSpell(true)} data-testid="button-create-world-spell">
                <Plus className="w-4 h-4 mr-1" /> New Spell
              </Button>
            )}
            {tab === 'characters' && (
              <Button size="sm" onClick={() => setShowCreateChar(true)} data-testid="button-create-world-character">
                <Plus className="w-4 h-4 mr-1" /> New Character
              </Button>
            )}
          </div>
        )}

        {tab === 'items' &&
          renderList(items, itemsLoading, 'No items yet.', (row) => (canEdit ? setEditItem(row) : setViewItem(row)), 'world-item', 'item')}
        {tab === 'spells' &&
          renderList(spells, spellsLoading, 'No spells yet.', (row) => (canEdit ? setEditSpell(row) : setViewSpell(row)), 'world-spell', 'spell')}
        {tab === 'characters' &&
          renderList(characters, charactersLoading, 'No characters yet.', (row) => setViewChar(row), 'world-character', 'character')}
      </div>

      {/* ---- Item create / edit (real editor) ---- */}
      {showCreateItem && (
        <ItemDialog
          open={showCreateItem}
          onOpenChange={(open: boolean) => setShowCreateItem(open)}
          mode="create"
          host={host}
          campaignSystem={slug}
          onSaved={() => {
            invalidateItems();
            setShowCreateItem(false);
            toast({ title: 'Item Created', description: 'World item created successfully' });
          }}
        />
      )}
      {editItem && (
        <ItemDialog
          open={!!editItem}
          onOpenChange={(open: boolean) => { if (!open) setEditItem(null); }}
          mode="edit"
          initialValue={itemToDraft(editItem)}
          host={host}
          campaignSystem={slug}
          onSaved={() => {
            invalidateItems();
            setEditItem(null);
            toast({ title: 'Item Updated', description: 'World item updated successfully' });
          }}
        />
      )}

      {/* ---- Item read-only view (real sheet) ---- */}
      {viewItem && (
        <ItemDetailDialog
          item={viewItem}
          open={!!viewItem}
          onOpenChange={(open: boolean) => { if (!open) setViewItem(null); }}
          isGM={false}
          isOwner={false}
          character={viewerCharacter}
          items={[]}
          onUpdate={() => {}}
          onDelete={() => {}}
          campaignSystem={slug}
        />
      )}

      {/* ---- Spell create / edit (real editor) ---- */}
      {showCreateSpell && (
        <SpellDialog
          open={showCreateSpell}
          onOpenChange={(open: boolean) => setShowCreateSpell(open)}
          mode="create"
          host={host}
          campaignSystem={slug}
          onSaved={() => {
            invalidateSpells();
            setShowCreateSpell(false);
            toast({ title: 'Spell Created', description: 'World spell created successfully' });
          }}
        />
      )}
      {editSpell && (
        <SpellDialog
          open={!!editSpell}
          onOpenChange={(open: boolean) => { if (!open) setEditSpell(null); }}
          mode="edit"
          initialValue={editSpell as any}
          host={host}
          campaignSystem={slug}
          onSaved={() => {
            invalidateSpells();
            setEditSpell(null);
            toast({ title: 'Spell Updated', description: 'World spell updated successfully' });
          }}
        />
      )}

      {/* ---- Spell read-only view ---- */}
      {viewSpell && (
        <Dialog open={!!viewSpell} onOpenChange={(open) => { if (!open) setViewSpell(null); }}>
          <DialogContent className="max-w-md" data-testid="dialog-view-world-spell">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {viewSpell.icon ? <img src={viewSpell.icon} alt="" className="w-8 h-8 rounded" /> : null}
                {viewSpell.name || 'Spell'}
              </DialogTitle>
              {viewSpell.description ? (
                <DialogDescription className="whitespace-pre-wrap">{viewSpell.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 text-sm text-stone-300">
              {viewSpell.school ? <div><span className="text-stone-500">School:</span> {viewSpell.school}</div> : null}
              {viewSpell.level != null ? <div><span className="text-stone-500">Level:</span> {viewSpell.level}</div> : null}
              {viewSpell.manaCost != null ? <div><span className="text-stone-500">Mana:</span> {viewSpell.manaCost}</div> : null}
              {viewSpell.energyCost != null ? <div><span className="text-stone-500">Energy:</span> {viewSpell.energyCost}</div> : null}
              {viewSpell.rangeNum != null ? <div><span className="text-stone-500">Range:</span> {viewSpell.rangeNum} ft</div> : null}
              {viewSpell.damageDice ? <div><span className="text-stone-500">Damage:</span> {viewSpell.damageDice} {viewSpell.damageType}</div> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewSpell(null)} data-testid="button-close-view-spell">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ---- Character create ---- */}
      {showCreateChar && (
        <Dialog open={showCreateChar} onOpenChange={(open) => { if (!open) setShowCreateChar(false); }}>
          <DialogContent className="max-w-sm" data-testid="dialog-create-world-character">
            <DialogHeader>
              <DialogTitle>New Character</DialogTitle>
              <DialogDescription>Create a character in this world, then open the full sheet to edit it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="world-char-name">Name</Label>
              <Input
                id="world-char-name"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                placeholder="Character name"
                data-testid="input-world-character-name"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChar(); }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateChar(false)} data-testid="button-cancel-create-character">Cancel</Button>
              <Button onClick={handleCreateChar} disabled={creatingChar} data-testid="button-confirm-create-character">
                {creatingChar ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ---- Character real sheet (view / edit) ---- */}
      {viewChar && (
        <div className="fixed inset-0 z-[10000] bg-stone-950/95 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <CharacterSheet
              character={viewChar}
              isGM={canEdit}
              isOwner={canEdit}
              isTemplate={true}
              accessLevel={canEdit ? 'edit' : 'view'}
              campaignSystem={slug}
              allSpecies={allSpecies}
              onUpdate={(updates: any) => {
                if (!canEdit) return;
                api.updateCharacterTemplate(viewChar.id, updates).then((updated) => {
                  if (updated) setViewChar(updated);
                  invalidateCharacters();
                });
              }}
              onClose={() => {
                setViewChar(null);
                invalidateCharacters();
              }}
            />
          </div>
        </div>
      )}

      {/* ---- Import item/spell into campaign: pick target character ---- */}
      {importObj && (
        <Dialog open={!!importObj} onOpenChange={(open) => { if (!open) { setImportObj(null); setImportTargetId(''); } }}>
          <DialogContent className="max-w-sm" data-testid="dialog-import-world-object">
            <DialogHeader>
              <DialogTitle>Import "{importObj.row.name || 'Object'}"</DialogTitle>
              <DialogDescription>
                Add a copy of this {importObj.kind} to a character in this campaign. The copy is independent of the world object.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Target character</Label>
              <Select value={importTargetId} onValueChange={setImportTargetId}>
                <SelectTrigger data-testid="select-import-target-character">
                  <SelectValue placeholder="Choose a character" />
                </SelectTrigger>
                <SelectContent>
                  {roster.map((c) => (
                    <SelectItem key={c.id} value={c.id} data-testid={`option-import-character-${c.id}`}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setImportObj(null); setImportTargetId(''); }} data-testid="button-cancel-import">Cancel</Button>
              <Button onClick={handleImportItemOrSpell} disabled={!importTargetId || importing} data-testid="button-confirm-import">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {imageBrowserElement}
    </div>
  );
}
