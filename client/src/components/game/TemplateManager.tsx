import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, Sword, Sparkles, X, Package } from "lucide-react";
import { api } from "@/lib/api";
import { RollEntriesEditor } from "./RollEntriesEditor";
import { toast } from "@/hooks/use-toast";
import { getEffectTypes, getEffectTypeLabel } from "@/lib/effectTypes";

interface TemplateManagerProps {
  campaignId: string;
  campaignSystem?: string;
}

const ITEM_TYPES = ["weapon", "armor", "consumable", "utility", "container", "currency"];
const RARITY_OPTIONS = ["common", "uncommon", "rare", "epic", "legendary"];
const ATTRIBUTE_OPTIONS = ["might", "finesse", "wit", "presence", "will", "craft"];

const rarityColors: Record<string, string> = {
  common: "text-stone-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-amber-400",
  legendary: "text-amber-400",
};

export function TemplateManager({ campaignId, campaignSystem }: TemplateManagerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"items" | "spells">("items");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingSpell, setEditingSpell] = useState<any>(null);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showCreateSpell, setShowCreateSpell] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "item" | "spell"; id: string; name: string } | null>(null);
  const [expandedRolls, setExpandedRolls] = useState<string | null>(null);

  const { data: templateData } = useQuery({
    queryKey: ["template-items", campaignId],
    queryFn: () => api.getTemplateItems(campaignId),
  });

  const { data: templateSpells = [] } = useQuery({
    queryKey: ["template-spells", campaignId],
    queryFn: () => api.getTemplateSpells(campaignId),
  });

  const campaignTemplateItems = templateData?.campaignItems || [];

  const createItemMutation = useMutation({
    mutationFn: (data: any) => api.createCampaignTemplateItem(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-items", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["template-items-summary", campaignId] });
      setShowCreateItem(false);
      toast({ title: "Template item created" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateCampaignTemplateItem(campaignId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-items", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["template-items-summary", campaignId] });
      setEditingItem(null);
      toast({ title: "Template item updated" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaignTemplateItem(campaignId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-items", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["template-items-summary", campaignId] });
      setDeleteConfirm(null);
      toast({ title: "Template item deleted" });
    },
  });

  const createSpellMutation = useMutation({
    mutationFn: (data: any) => api.createCampaignTemplateSpell(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-spells", campaignId] });
      setShowCreateSpell(false);
      toast({ title: "Template spell created" });
    },
  });

  const updateSpellMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateCampaignTemplateSpell(campaignId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-spells", campaignId] });
      setEditingSpell(null);
      toast({ title: "Template spell updated" });
    },
  });

  const deleteSpellMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaignTemplateSpell(campaignId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-spells", campaignId] });
      setDeleteConfirm(null);
      toast({ title: "Template spell deleted" });
    },
  });

  return (
    <div className="space-y-3" data-testid="template-manager">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "items" | "spells")}>
        <TabsList className="bg-stone-800 border border-stone-700 w-full">
          <TabsTrigger value="items" className="flex-1 text-xs data-[state=active]:bg-stone-700" data-testid="tab-template-items">
            <Sword className="w-3 h-3 mr-1" /> Items ({campaignTemplateItems.length})
          </TabsTrigger>
          <TabsTrigger value="spells" className="flex-1 text-xs data-[state=active]:bg-stone-700" data-testid="tab-template-spells">
            <Sparkles className="w-3 h-3 mr-1" /> Spells ({templateSpells.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-stone-400">Campaign item templates with linked rolls</p>
            <Button size="sm" variant="outline" className="h-7 text-xs border-stone-600" onClick={() => setShowCreateItem(true)} data-testid="button-create-template-item">
              <Plus className="w-3 h-3 mr-1" /> New
            </Button>
          </div>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {campaignTemplateItems.length === 0 && (
                <p className="text-xs text-stone-500 text-center py-4">No item templates yet</p>
              )}
              {campaignTemplateItems.map((item: any) => (
                <div key={item.id} className="bg-stone-800/50 border border-stone-700 rounded p-2" data-testid={`template-item-${item.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-stone-700 flex items-center justify-center shrink-0">
                          <Package className="w-3 h-3 text-stone-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className={`text-xs font-medium truncate block ${rarityColors[item.rarity] || "text-stone-200"}`}>{item.name}</span>
                        <span className="text-[10px] text-stone-500">{item.itemType}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setExpandedRolls(expandedRolls === item.id ? null : item.id)} data-testid={`button-toggle-rolls-${item.id}`}>
                        <Sword className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingItem(item)} data-testid={`button-edit-template-item-${item.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={() => setDeleteConfirm({ type: "item", id: item.id, name: item.name })} data-testid={`button-delete-template-item-${item.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {expandedRolls === item.id && (
                    <div className="mt-2 border-t border-stone-700 pt-2">
                      <RollEntriesEditor ownerType="item" ownerId={item.id} canEdit={true} campaignSystem={campaignSystem} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="spells" className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-stone-400">Campaign spell templates with linked rolls</p>
            <Button size="sm" variant="outline" className="h-7 text-xs border-stone-600" onClick={() => setShowCreateSpell(true)} data-testid="button-create-template-spell">
              <Plus className="w-3 h-3 mr-1" /> New
            </Button>
          </div>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {templateSpells.length === 0 && (
                <p className="text-xs text-stone-500 text-center py-4">No spell templates yet</p>
              )}
              {templateSpells.map((spell: any) => (
                <div key={spell.id} className="bg-stone-800/50 border border-stone-700 rounded p-2" data-testid={`template-spell-${spell.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded bg-amber-900/30 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block text-stone-200">{spell.name}</span>
                        <span className="text-[10px] text-stone-500">
                          {spell.damageType || "No type"} {spell.damageDice ? `(${spell.damageDice})` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setExpandedRolls(expandedRolls === spell.id ? null : spell.id)} data-testid={`button-toggle-rolls-${spell.id}`}>
                        <Sparkles className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingSpell(spell)} data-testid={`button-edit-template-spell-${spell.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={() => setDeleteConfirm({ type: "spell", id: spell.id, name: spell.name })} data-testid={`button-delete-template-spell-${spell.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {expandedRolls === spell.id && (
                    <div className="mt-2 border-t border-stone-700 pt-2">
                      <RollEntriesEditor ownerType="spell" ownerId={spell.id} canEdit={true} campaignSystem={campaignSystem} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <CreateItemTemplateDialog
        open={showCreateItem}
        onOpenChange={setShowCreateItem}
        onSave={(data) => createItemMutation.mutate(data)}
        isPending={createItemMutation.isPending}
        campaignSystem={campaignSystem}
      />

      <CreateSpellTemplateDialog
        open={showCreateSpell}
        onOpenChange={setShowCreateSpell}
        onSave={(data) => createSpellMutation.mutate(data)}
        isPending={createSpellMutation.isPending}
        campaignSystem={campaignSystem}
      />

      {editingItem && (
        <EditItemTemplateDialog
          open={!!editingItem}
          onOpenChange={() => setEditingItem(null)}
          item={editingItem}
          onSave={(data) => updateItemMutation.mutate({ id: editingItem.id, data })}
          isPending={updateItemMutation.isPending}
          campaignSystem={campaignSystem}
        />
      )}

      {editingSpell && (
        <EditSpellTemplateDialog
          open={!!editingSpell}
          onOpenChange={() => setEditingSpell(null)}
          spell={editingSpell}
          onSave={(data) => updateSpellMutation.mutate({ id: editingSpell.id, data })}
          isPending={updateSpellMutation.isPending}
          campaignSystem={campaignSystem}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deleteConfirm?.name}"? Items/spells using this template will keep their current rolls but lose the template link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 border-stone-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirm?.type === "item") {
                  deleteItemMutation.mutate(deleteConfirm.id);
                } else if (deleteConfirm?.type === "spell") {
                  deleteSpellMutation.mutate(deleteConfirm.id);
                }
              }}
              data-testid="button-confirm-delete-template"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateItemTemplateDialog({ open, onOpenChange, onSave, isPending, campaignSystem }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (data: any) => void; isPending: boolean; campaignSystem?: string }) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("weapon");
  const [rarity, setRarity] = useState("common");
  const [description, setDescription] = useState("");
  const [damage, setDamage] = useState("");
  const [damageType, setDamageType] = useState("");
  const [attribute, setAttribute] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      itemType,
      rarity,
      description,
      damage: damage || undefined,
      damageType: damageType || undefined,
      attribute: attribute || undefined,
      system: "arcana-adventure",
    });
    setName("");
    setDescription("");
    setDamage("");
    setDamageType("");
    setAttribute("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle>Create Item Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-800 border-stone-700 h-8 text-sm" data-testid="input-template-item-name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  {ITEM_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rarity</Label>
              <Select value={rarity} onValueChange={setRarity}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  {RARITY_OPTIONS.map((r) => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-stone-800 border-stone-700 text-sm min-h-[60px]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Damage</Label>
              <Input value={damage} onChange={(e) => setDamage(e.target.value)} placeholder="1d8" className="bg-stone-800 border-stone-700 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">{getEffectTypeLabel(campaignSystem)}</Label>
              <Select value={damageType || "_none"} onValueChange={(v) => setDamageType(v === "_none" ? "" : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="_none" className="text-xs">None</SelectItem>
                  {getEffectTypes(campaignSystem).map((d) => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Attribute</Label>
              <Select value={attribute || "_none"} onValueChange={(v) => setAttribute(v === "_none" ? "" : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="_none" className="text-xs">None</SelectItem>
                  {ATTRIBUTE_OPTIONS.map((a) => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-stone-700" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending} data-testid="button-save-template-item">
            {isPending ? "Creating..." : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditItemTemplateDialog({ open, onOpenChange, item, onSave, isPending, campaignSystem }: { open: boolean; onOpenChange: (v: boolean) => void; item: any; onSave: (data: any) => void; isPending: boolean; campaignSystem?: string }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [damage, setDamage] = useState(item.damage || "");
  const [damageType, setDamageType] = useState(item.damageType || "");
  const [attribute, setAttribute] = useState(item.attribute || "");
  const [rarity, setRarity] = useState(item.rarity || "common");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description, damage: damage || undefined, damageType: damageType || undefined, attribute: attribute || undefined, rarity });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Item Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-800 border-stone-700 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-stone-800 border-stone-700 text-sm min-h-[60px]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Damage</Label>
              <Input value={damage} onChange={(e) => setDamage(e.target.value)} className="bg-stone-800 border-stone-700 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">{getEffectTypeLabel(campaignSystem)}</Label>
              <Select value={damageType || "_none"} onValueChange={(v) => setDamageType(v === "_none" ? "" : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="_none" className="text-xs">None</SelectItem>
                  {getEffectTypes(campaignSystem).map((d) => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rarity</Label>
              <Select value={rarity} onValueChange={setRarity}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  {RARITY_OPTIONS.map((r) => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-stone-700" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSpellTemplateDialog({ open, onOpenChange, onSave, isPending, campaignSystem }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (data: any) => void; isPending: boolean; campaignSystem?: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [damageDice, setDamageDice] = useState("");
  const [damageType, setDamageType] = useState("");
  const [attribute, setAttribute] = useState("");
  const [energyCost, setEnergyCost] = useState(1);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description,
      damageDice: damageDice || undefined,
      damageType: damageType || undefined,
      attribute: attribute || undefined,
      energyCost,
      isAttack: true,
    });
    setName("");
    setDescription("");
    setDamageDice("");
    setDamageType("");
    setAttribute("");
    setEnergyCost(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle>Create Spell Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-800 border-stone-700 h-8 text-sm" data-testid="input-template-spell-name" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-stone-800 border-stone-700 text-sm min-h-[60px]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Damage Dice</Label>
              <Input value={damageDice} onChange={(e) => setDamageDice(e.target.value)} placeholder="2d6" className="bg-stone-800 border-stone-700 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">{getEffectTypeLabel(campaignSystem)}</Label>
              <Select value={damageType || "_none"} onValueChange={(v) => setDamageType(v === "_none" ? "" : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="_none" className="text-xs">None</SelectItem>
                  {getEffectTypes(campaignSystem).map((d) => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Energy Cost</Label>
              <NumberInput value={energyCost} onChange={(v) => setEnergyCost(v ?? 0)} className="bg-stone-800 border-stone-700 h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Attribute</Label>
            <Select value={attribute || "_none"} onValueChange={(v) => setAttribute(v === "_none" ? "" : v)}>
              <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                <SelectItem value="_none" className="text-xs">None</SelectItem>
                {ATTRIBUTE_OPTIONS.map((a) => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-stone-700" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending} data-testid="button-save-template-spell">
            {isPending ? "Creating..." : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSpellTemplateDialog({ open, onOpenChange, spell, onSave, isPending, campaignSystem }: { open: boolean; onOpenChange: (v: boolean) => void; spell: any; onSave: (data: any) => void; isPending: boolean; campaignSystem?: string }) {
  const [name, setName] = useState(spell.name);
  const [description, setDescription] = useState(spell.description || "");
  const [damageDice, setDamageDice] = useState(spell.damageDice || "");
  const [damageType, setDamageType] = useState(spell.damageType || "");
  const [attribute, setAttribute] = useState(spell.attribute || "");
  const [energyCost, setEnergyCost] = useState(spell.energyCost ?? 1);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description, damageDice: damageDice || undefined, damageType: damageType || undefined, attribute: attribute || undefined, energyCost });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Spell Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-800 border-stone-700 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-stone-800 border-stone-700 text-sm min-h-[60px]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Damage Dice</Label>
              <Input value={damageDice} onChange={(e) => setDamageDice(e.target.value)} className="bg-stone-800 border-stone-700 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">{getEffectTypeLabel(campaignSystem)}</Label>
              <Select value={damageType || "_none"} onValueChange={(v) => setDamageType(v === "_none" ? "" : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="_none" className="text-xs">None</SelectItem>
                  {getEffectTypes(campaignSystem).map((d) => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Energy Cost</Label>
              <NumberInput value={energyCost} onChange={(v) => setEnergyCost(v ?? 0)} className="bg-stone-800 border-stone-700 h-8 text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-stone-700" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
