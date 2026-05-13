// server/sync/children.ts
//
// Bundles nested child rows (rolls, embedded items/spells, feats, classes,
// skill nodes/connections, etc.) into the sync GET responses and applies
// them on POST/PATCH/DELETE so partner apps (CanvasRealms) can round-trip
// the FULL entity, not just the parent row's flat columns.
//
// Replace semantics: when the caller sends a children array on upsert,
// existing children of that kind are deleted and replaced with the new set
// (atomic per-kind sequence). Caller may omit a children key entirely to
// leave that child set untouched (useful for PATCH).
//
// Polymorphic roll_entries are not FK-cascaded, so we always delete them
// explicitly when their owner is replaced or deleted.

import { storage } from "../storage";
import { db } from "../db";
import {
  rollEntries, items, spells, hotbars,
  characterCustomSkills, characterTraits, characterFeats,
  characterClasses, characterClassSkills,
  classSkillNodes, classSkillConnections,
  feats, featConnections,
  itemTemplateLinks, spellTemplateLinks,
  type InsertRollEntry, type InsertItem, type InsertSpell,
  type InsertCraftRecipe, type InsertCraftRecipeIngredient, type InsertCraftRecipeOutcome,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { Kind } from "./api";

// `craftRecipes` and `templateLinks` were added in 11/2025 to support
// the @arcana/library-dialogs ItemDialog (foundation slice).
// `templateLinks` is also accepted on `spell` for parity. (`roll-template`
// is itself a template — it has no template links of its own.)
const CHILD_KEYS: Partial<Record<Kind, string[]>> = {
  "item": ["rolls", "craftRecipes", "templateLinks"],
  "spell": ["rolls", "templateLinks"],
  "roll-template": ["rolls"],
  "character": ["items", "spells", "hotbars", "customSkills", "traits", "feats", "classes", "classSkills"],
  "character-template": ["items", "spells", "hotbars", "customSkills", "traits", "feats", "classes", "classSkills"],
  "class": ["skillNodes", "skillConnections"],
  "feat-tree": ["feats", "connections"],
};

export function childKeysFor(kind: Kind): string[] {
  return CHILD_KEYS[kind] || [];
}

// ---- Helpers ----

function stripCommon<T extends Record<string, any>>(row: T, extra: string[] = []): any {
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = row as any;
  for (const k of extra) delete (rest as any)[k];
  return rest;
}

async function getRolls(ownerType: string, ownerId: string) {
  return await storage.getRollEntries(ownerType, ownerId);
}

async function replaceRolls(ownerType: string, ownerId: string, rolls: any[] | undefined) {
  if (!Array.isArray(rolls)) return;
  await storage.deleteRollEntriesByOwner(ownerType, ownerId);
  if (rolls.length === 0) return;
  const cleaned = rolls.map(r => {
    const base = stripCommon(r, ["ownerType", "ownerId"]);
    return { ...base, ownerType, ownerId } as InsertRollEntry;
  });
  await storage.createRollEntriesBulk(cleaned);
}

// ---- Serialize (read path) ----

async function serializeItemWithRolls(item: any, includeItemChildren = false) {
  if (!item) return item;
  const rolls = await getRolls("item", item.id);
  if (!includeItemChildren) return { ...item, rolls };
  const [craftRecipes, templateLinks] = await Promise.all([
    storage.getCraftRecipesByItem(item.id).catch(() => []),
    storage.getItemTemplateLinks(item.id).catch(() => []),
  ]);
  return { ...item, rolls, craftRecipes, templateLinks };
}

async function serializeSpellWithRolls(spell: any, includeSpellChildren = false) {
  if (!spell) return spell;
  const rolls = await getRolls("spell", spell.id);
  if (!includeSpellChildren) return { ...spell, rolls };
  const templateLinks = await storage.getSpellTemplateLinks(spell.id).catch(() => []);
  return { ...spell, rolls, templateLinks };
}

async function serializeCharacter(row: any) {
  if (!row) return row;
  const [chItems, chSpells, hotbarsList, customSkills, traits, chFeats, chClasses] = await Promise.all([
    storage.getItemsByCharacter(row.id),
    storage.getSpellsByCharacter(row.id),
    storage.getHotbarsByCharacter(row.id),
    storage.getCharacterCustomSkills(row.id),
    storage.getCharacterTraits(row.id),
    storage.getCharacterFeats(row.id),
    storage.getCharacterClasses(row.id),
  ]);
  const itemsWithRolls = await Promise.all(chItems.map((it) => serializeItemWithRolls(it)));
  const spellsWithRolls = await Promise.all(chSpells.map((sp) => serializeSpellWithRolls(sp)));
  // Per-class skills (flatten across all classes the character has).
  const classSkills: any[] = [];
  for (const cc of chClasses) {
    const sks = await storage.getCharacterClassSkills(row.id, cc.classId);
    classSkills.push(...sks);
  }
  return {
    ...row,
    items: itemsWithRolls,
    spells: spellsWithRolls,
    hotbars: hotbarsList,
    customSkills,
    traits,
    feats: chFeats,
    classes: chClasses,
    classSkills,
  };
}

async function serializeClass(row: any) {
  if (!row) return row;
  const [skillNodes, skillConnections] = await Promise.all([
    storage.getClassSkillNodes(row.id),
    storage.getClassSkillConnections(row.id),
  ]);
  return { ...row, skillNodes, skillConnections };
}

async function serializeFeatTree(row: any) {
  if (!row) return row;
  const [treeFeats, treeConnections] = await Promise.all([
    storage.getFeats(row.id),
    storage.getFeatConnections(row.id),
  ]);
  return { ...row, feats: treeFeats, connections: treeConnections };
}

export async function serializeWithChildren(kind: Kind, row: any): Promise<any> {
  if (!row) return row;
  if (kind === "item") return await serializeItemWithRolls(row, true);
  if (kind === "roll-template") return await serializeItemWithRolls(row, false);
  if (kind === "spell") return await serializeSpellWithRolls(row, true);
  if (kind === "character" || kind === "character-template") return await serializeCharacter(row);
  if (kind === "class") return await serializeClass(row);
  if (kind === "feat-tree") return await serializeFeatTree(row);
  return row;
}

export async function serializeListWithChildren(kind: Kind, rows: any[]): Promise<any[]> {
  return await Promise.all(rows.map(r => serializeWithChildren(kind, r)));
}

// ---- Extract (write path) ----

export function extractChildren(kind: Kind, body: any): { parentBody: any; children: Record<string, any[] | undefined> } {
  const keys = childKeysFor(kind);
  const children: Record<string, any[] | undefined> = {};
  const parentBody: any = { ...(body || {}) };
  for (const k of keys) {
    if (parentBody[k] !== undefined) {
      children[k] = Array.isArray(parentBody[k]) ? parentBody[k] : [];
      delete parentBody[k];
    }
  }
  return { parentBody, children };
}

// ---- Apply (write path) ----

export async function applyChildren(
  kind: Kind,
  parentId: string,
  children: Record<string, any[] | undefined>,
): Promise<void> {
  if (kind === "item") {
    await replaceRolls("item", parentId, children.rolls);
    await replaceCraftRecipes(parentId, children.craftRecipes);
    await replaceItemTemplateLinks(parentId, children.templateLinks);
    return;
  }
  if (kind === "roll-template") {
    await replaceRolls("item", parentId, children.rolls);
    return;
  }
  if (kind === "spell") {
    await replaceRolls("spell", parentId, children.rolls);
    await replaceSpellTemplateLinks(parentId, children.templateLinks);
    return;
  }
  if (kind === "character" || kind === "character-template") {
    await replaceCharacterChildren(parentId, children);
    return;
  }
  if (kind === "class") {
    await replaceClassChildren(parentId, children);
    return;
  }
  if (kind === "feat-tree") {
    await replaceFeatTreeChildren(parentId, children);
    return;
  }
}

// Replace the full set of craft recipes (and their nested ingredients/outcomes)
// for a crafter item. Caller may omit (undefined) to leave existing recipes
// untouched; an empty array clears them.
async function replaceCraftRecipes(parentItemId: string, recipes: any[] | undefined) {
  if (!Array.isArray(recipes)) return;
  const existing = await storage.getCraftRecipesByItem(parentItemId).catch(() => []);
  for (const r of existing) {
    await storage.deleteCraftRecipe(r.id);
  }
  if (recipes.length === 0) return;
  for (const r of recipes) {
    const cleaned = stripCommon(r, ["parentItemId", "parentTemplateId", "ingredients", "outcomes"]);
    const ingredients: Omit<InsertCraftRecipeIngredient, "recipeId">[] =
      Array.isArray(r.ingredients)
        ? r.ingredients.map((ing: any) => stripCommon(ing, ["recipeId"]))
        : [];
    const outcomes: Omit<InsertCraftRecipeOutcome, "recipeId">[] =
      Array.isArray(r.outcomes)
        ? r.outcomes.map((o: any) => stripCommon(o, ["recipeId"]))
        : [];
    const recipe: InsertCraftRecipe = {
      ...(cleaned as Omit<InsertCraftRecipe, "parentItemId" | "parentTemplateId">),
      parentItemId,
      parentTemplateId: null,
    };
    await storage.createCraftRecipe(recipe, ingredients, outcomes);
  }
}

// Replace item↔roll-template link set. Caller may omit (undefined) to leave
// existing links untouched; an empty array clears them.
async function replaceItemTemplateLinks(itemId: string, links: any[] | undefined) {
  if (!Array.isArray(links)) return;
  await db.delete(itemTemplateLinks).where(eq(itemTemplateLinks.itemId, itemId));
  if (links.length === 0) return;
  // Accept either bare strings (template ids) or { templateId } objects.
  const ids = links.map(l => (typeof l === "string" ? l : l?.templateId)).filter((id): id is string => !!id);
  if (ids.length === 0) return;
  // Use the storage helper so propagation/copy semantics are honored if implemented.
  for (const templateId of ids) {
    await storage.addItemTemplateLink(itemId, templateId);
  }
}

async function replaceSpellTemplateLinks(spellId: string, links: any[] | undefined) {
  if (!Array.isArray(links)) return;
  await db.delete(spellTemplateLinks).where(eq(spellTemplateLinks.spellId, spellId));
  if (links.length === 0) return;
  const ids = links.map(l => (typeof l === "string" ? l : l?.templateId)).filter((id): id is string => !!id);
  if (ids.length === 0) return;
  for (const templateId of ids) {
    await storage.addSpellTemplateLink(spellId, templateId);
  }
}

async function replaceClassChildren(classId: string, children: Record<string, any[] | undefined>) {
  // Build remap so client-supplied connection nodeIds resolve to the freshly-inserted node ids.
  let nodeIdRemap = new Map<string, string>();
  if (children.skillNodes !== undefined) {
    // Connections cascade-delete via FK on classes->classSkillNodes->classSkillConnections.
    // Delete connections first explicitly (defensive) then nodes.
    await db.delete(classSkillConnections).where(eq(classSkillConnections.classId, classId));
    await db.delete(classSkillNodes).where(eq(classSkillNodes.classId, classId));
    if (children.skillNodes.length > 0) {
      for (const n of children.skillNodes) {
        const oldId = (n as any).id;
        const created = await storage.createClassSkillNode({ ...stripCommon(n, ["classId"]), classId } as any);
        if (oldId) nodeIdRemap.set(oldId, created.id);
      }
    }
  }
  if (children.skillConnections !== undefined) {
    await db.delete(classSkillConnections).where(eq(classSkillConnections.classId, classId));
    if (children.skillConnections.length > 0) {
      for (const c of children.skillConnections) {
        const fromOld = (c as any).fromNodeId;
        const toOld = (c as any).toNodeId;
        const fromNew = nodeIdRemap.get(fromOld) || fromOld;
        const toNew = nodeIdRemap.get(toOld) || toOld;
        await storage.createClassSkillConnection({
          ...stripCommon(c, ["classId", "fromNodeId", "toNodeId"]),
          classId, fromNodeId: fromNew, toNodeId: toNew,
        } as any);
      }
    }
  }
}

async function replaceFeatTreeChildren(treeId: string, children: Record<string, any[] | undefined>) {
  let featIdRemap = new Map<string, string>();
  if (children.feats !== undefined) {
    // FK cascade: feat_connections.fromFeatId/toFeatId reference feats; delete connections first.
    await db.delete(featConnections).where(eq(featConnections.treeId, treeId));
    await db.delete(feats).where(eq(feats.treeId, treeId));
    if (children.feats.length > 0) {
      for (const f of children.feats) {
        const oldId = (f as any).id;
        const created = await storage.createFeat({ ...stripCommon(f, ["treeId"]), treeId } as any);
        if (oldId) featIdRemap.set(oldId, created.id);
      }
    }
  }
  if (children.connections !== undefined) {
    await db.delete(featConnections).where(eq(featConnections.treeId, treeId));
    if (children.connections.length > 0) {
      for (const c of children.connections) {
        const fromOld = (c as any).fromFeatId;
        const toOld = (c as any).toFeatId;
        const fromNew = featIdRemap.get(fromOld) || fromOld;
        const toNew = featIdRemap.get(toOld) || toOld;
        await storage.createFeatConnection({
          ...stripCommon(c, ["treeId", "fromFeatId", "toFeatId"]),
          treeId, fromFeatId: fromNew, toFeatId: toNew,
        } as any);
      }
    }
  }
}

async function replaceCharacterChildren(characterId: string, children: Record<string, any[] | undefined>) {
  // Order matters because of FKs and ID remaps:
  //   1. Items   (replace) -> remap oldId -> newId, attach rolls
  //   2. Spells  (replace) -> remap oldId -> newId, attach rolls
  //   3. Hotbars (replace) -> rewrite itemId/spellId via remaps
  //   4. CustomSkills, Traits, Feats, Classes, ClassSkills (replace)

  let itemIdRemap = new Map<string, string>();
  let spellIdRemap = new Map<string, string>();

  if (children.items !== undefined) {
    // Hotbars FK to items+spells -> delete hotbars first (defensive even though FK has no cascade decl shown).
    await db.delete(hotbars).where(eq(hotbars.characterId, characterId));
    const oldItems = await storage.getItemsByCharacter(characterId);
    for (const it of oldItems) {
      await storage.deleteRollEntriesByOwner("item", it.id);
    }
    await db.delete(items).where(eq(items.characterId, characterId));

    if (children.items.length > 0) {
      const oldToNewWithContainer: Array<{ oldId: string | undefined; newId: string; oldContainerId: string | null | undefined }> = [];
      for (const item of children.items) {
        const oldId = (item as any).id as string | undefined;
        const oldContainerId = (item as any).containerId as string | null | undefined;
        const itemRolls = (item as any).rolls as any[] | undefined;
        const cleaned = stripCommon(item, ["characterId", "containerId", "rolls"]);
        const created = await storage.createItem({
          ...(cleaned as InsertItem),
          characterId, containerId: null,
        });
        if (oldId) itemIdRemap.set(oldId, created.id);
        oldToNewWithContainer.push({ oldId, newId: created.id, oldContainerId });
        if (Array.isArray(itemRolls)) {
          await replaceRolls("item", created.id, itemRolls);
        }
      }
      // Patch container references after all items exist.
      for (const { newId, oldContainerId } of oldToNewWithContainer) {
        if (oldContainerId && itemIdRemap.has(oldContainerId)) {
          await storage.updateItem(newId, { containerId: itemIdRemap.get(oldContainerId)! } as any);
        }
      }
    }
  }

  if (children.spells !== undefined) {
    const oldSpells = await storage.getSpellsByCharacter(characterId);
    for (const sp of oldSpells) {
      await storage.deleteRollEntriesByOwner("spell", sp.id);
    }
    await db.delete(spells).where(eq(spells.characterId, characterId));
    if (children.spells.length > 0) {
      for (const spell of children.spells) {
        const oldId = (spell as any).id as string | undefined;
        const spellRolls = (spell as any).rolls as any[] | undefined;
        const cleaned = stripCommon(spell, ["characterId", "rolls"]);
        const created = await storage.createSpell({ ...(cleaned as InsertSpell), characterId });
        if (oldId) spellIdRemap.set(oldId, created.id);
        if (Array.isArray(spellRolls)) {
          await replaceRolls("spell", created.id, spellRolls);
        }
      }
    }
  }

  if (children.hotbars !== undefined) {
    await db.delete(hotbars).where(eq(hotbars.characterId, characterId));
    if (children.hotbars.length > 0) {
      const rows = children.hotbars.map((hb: any) => {
        const cleaned = stripCommon(hb, ["characterId", "itemId", "spellId"]);
        return {
          ...cleaned,
          characterId,
          itemId: hb.itemId ? (itemIdRemap.get(hb.itemId) || hb.itemId) : null,
          spellId: hb.spellId ? (spellIdRemap.get(hb.spellId) || hb.spellId) : null,
        };
      });
      await db.insert(hotbars).values(rows as any);
    }
  }

  if (children.customSkills !== undefined) {
    await db.delete(characterCustomSkills).where(eq(characterCustomSkills.characterId, characterId));
    if (children.customSkills.length > 0) {
      const rows = children.customSkills.map((s: any) => ({ ...stripCommon(s, ["characterId"]), characterId }));
      await db.insert(characterCustomSkills).values(rows as any);
    }
  }

  if (children.traits !== undefined) {
    await db.delete(characterTraits).where(eq(characterTraits.characterId, characterId));
    if (children.traits.length > 0) {
      const rows = children.traits.map((t: any) => ({ ...stripCommon(t, ["characterId"]), characterId }));
      await db.insert(characterTraits).values(rows as any);
    }
  }

  if (children.feats !== undefined) {
    await db.delete(characterFeats).where(eq(characterFeats.characterId, characterId));
    if (children.feats.length > 0) {
      const rows = children.feats.map((f: any) => ({ ...stripCommon(f, ["characterId"]), characterId }));
      await db.insert(characterFeats).values(rows as any);
    }
  }

  if (children.classes !== undefined) {
    await db.delete(characterClasses).where(eq(characterClasses.characterId, characterId));
    if (children.classes.length > 0) {
      const rows = children.classes.map((c: any) => ({ ...stripCommon(c, ["characterId"]), characterId }));
      await db.insert(characterClasses).values(rows as any);
    }
  }

  if (children.classSkills !== undefined) {
    await db.delete(characterClassSkills).where(eq(characterClassSkills.characterId, characterId));
    if (children.classSkills.length > 0) {
      const rows = children.classSkills.map((s: any) => ({ ...stripCommon(s, ["characterId"]), characterId }));
      await db.insert(characterClassSkills).values(rows as any);
    }
  }
}

// ---- Cascade-delete polymorphic rolls before parent delete ----
export async function cascadeChildrenDelete(kind: Kind, parentId: string): Promise<void> {
  if (kind === "item" || kind === "roll-template") {
    await storage.deleteRollEntriesByOwner("item", parentId);
    return;
  }
  if (kind === "spell") {
    await storage.deleteRollEntriesByOwner("spell", parentId);
    return;
  }
  if (kind === "character" || kind === "character-template") {
    // Clean up polymorphic rolls hanging off embedded items/spells before
    // FK cascade nukes the items/spells themselves.
    const oldItems = await storage.getItemsByCharacter(parentId);
    for (const it of oldItems) await storage.deleteRollEntriesByOwner("item", it.id);
    const oldSpells = await storage.getSpellsByCharacter(parentId);
    for (const sp of oldSpells) await storage.deleteRollEntriesByOwner("spell", sp.id);
    return;
  }
  // class, feat-tree, species: their children are pure FK relationships and cascade automatically.
}
