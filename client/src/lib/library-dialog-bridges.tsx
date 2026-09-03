import { useCallback, useRef, useState } from 'react';
import type {
  LibraryTransport,
  HostModalComponent,
  ImagePickerOpts,
} from '@arcana/library-dialogs';
import type { ItemDraft } from '@arcana/library-dialogs';
import type { SyncEnvelope, SyncKind } from '@arcana/library-dialogs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ImageBrowser } from '@/components/ImageBrowser';
import { api, type Item as ApiItem } from '@/lib/api';

const TRANSIENT_ROLL_FIELDS = [
  '_localId',
  'templateName',
  'templatePriority',
  'templateUseOwnOrder',
  'templateOwnerKey',
] as const;

const TRANSIENT_RECIPE_FIELDS = ['_localId', 'outputItemName'] as const;

interface Identified {
  id?: string;
  [k: string]: unknown;
}

function stripFields<T extends Identified>(obj: T, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (!fields.includes(k)) out[k] = (obj as Record<string, unknown>)[k];
  }
  return out;
}

function envelope<T>(kind: SyncKind, id: string, data: T): SyncEnvelope<T> {
  return { kind, id, externalId: null, data };
}

/**
 * Maps a runtime Arcana `Item` (admin system-item shape, which carries more
 * fields than the lean `api.Item` interface) to the dialog's `ItemDraft`.
 * Spread is safe because ItemDraft is a superset of the persisted shape and
 * the dialog only reads keys it knows about.
 */
export function itemToDraft(item: ApiItem): ItemDraft {
  return {
    ...(item as unknown as Record<string, unknown>),
    id: item.id,
    name: item.name,
    itemType: item.itemType,
  } as ItemDraft;
}

export function arcanaApiTransport(systemSlug: string, personal?: boolean, worldId?: string): LibraryTransport {
  // World scope is governed by world access, not the personal library flag.
  const scopePersonal = worldId ? undefined : personal;
  const scope = worldId ? { worldId } : (personal ? { personal: true } : {});
  return {
    list: async <T,>(kind: SyncKind): Promise<{ data: T[] }> => {
      if (kind === 'item') return { data: (await api.getSystemItems(systemSlug, undefined, scopePersonal, worldId)) as T[] };
      if (kind === 'spell') return { data: (await api.getSystemSpells(systemSlug, scopePersonal, worldId)) as T[] };
      if (kind === 'roll-template') return { data: (await api.getItemTemplates(systemSlug, personal)) as T[] };
      throw new Error(`arcanaApiTransport: unsupported list kind "${kind}"`);
    },
    get: async <T,>(kind: SyncKind, id: string): Promise<SyncEnvelope<T>> => {
      if (kind === 'item') {
        // Build recipes only exist in AA V2 / V3 libraries.
        const supportsBuild = systemSlug === 'aa-v2' || systemSlug === 'aa-v3';
        // Fail-closed: do NOT swallow child-load errors. If any of the
        // fetches fails (network/auth/transient), let it propagate so the
        // dialog refuses to hydrate rather than presenting empty children
        // that a subsequent save would treat as authoritative deletions.
        const [item, rolls, craftRecipes, links, buildRecipeRes] = await Promise.all([
          api.getSystemItem(id),
          api.getItemRolls(id),
          api.getCraftRecipes(id),
          api.getItemTemplateLinks(id),
          supportsBuild ? api.getItemBuildRecipe(id) : Promise.resolve({ buildRecipe: null }),
        ]);
        const data = {
          ...item,
          rolls,
          craftRecipes,
          templateLinks: links.templateIds,
          buildRecipe: buildRecipeRes.buildRecipe,
        } as unknown as T;
        return envelope(kind, id, data);
      }
      if (kind === 'spell') {
        const [spell, rolls, links] = await Promise.all([
          api.getSystemSpell(id),
          api.getSpellRolls(id),
          api.getSpellTemplateLinks(id),
        ]);
        const data = {
          ...spell,
          rolls,
          templateLinks: links.templateIds,
        } as unknown as T;
        return envelope(kind, id, data);
      }
      throw new Error(`arcanaApiTransport: unsupported get kind "${kind}"`);
    },
    upsert: async <T,>(kind: SyncKind, body: T & { externalId?: string; externalUpdatedAt?: string }): Promise<SyncEnvelope<T>> => {
      if (kind === 'item') {
        const supportsBuild = systemSlug === 'aa-v2' || systemSlug === 'aa-v3';
        const draft = body as unknown as ItemDraft & { buildRecipe?: { outputQuantity?: number; ingredients?: any[] } | null };
        const { rolls = [], craftRecipes = [], templateLinks, buildRecipe, ...itemFields } = draft;
        const created = await api.createSystemItem({
          ...(itemFields as Partial<ApiItem>),
          system: systemSlug,
          ...scope,
        } as unknown as Partial<ApiItem>);

        // Server may auto-create rolls (e.g. Detonate when isDetonatable=true).
        // Skip drafts whose name already exists to avoid duplicates. Failure
        // here is fatal: we MUST know the server's auto-created set before
        // appending drafts, otherwise we'd duplicate the auto-roll.
        const existingRolls = await api.getItemRolls(created.id);
        const existingNames = new Set(existingRolls.map((r) => r.name));
        for (const roll of rolls) {
          if (existingNames.has(roll.name)) continue;
          const cleaned = stripFields(roll as Identified, TRANSIENT_ROLL_FIELDS);
          delete cleaned.id;
          await api.createRollEntry({ ...cleaned, ownerType: 'item', ownerId: created.id });
        }

        for (const recipe of craftRecipes) {
          const cleaned = stripFields(recipe as Identified, TRANSIENT_RECIPE_FIELDS);
          delete cleaned.id;
          await api.createCraftRecipe(created.id, cleaned);
        }

        if (Array.isArray(templateLinks) && templateLinks.length > 0) {
          await api.setItemTemplateLinks(created.id, templateLinks);
        }

        if (supportsBuild && buildRecipe && Array.isArray(buildRecipe.ingredients) && buildRecipe.ingredients.length > 0) {
          await api.saveItemBuildRecipe(created.id, {
            outputQuantity: buildRecipe.outputQuantity ?? 1,
            ingredients: buildRecipe.ingredients.map((ing: any) => ({ itemId: ing.itemId ?? null, itemName: ing.itemName ?? '', quantity: ing.quantity ?? 1 })),
          });
        }

        return envelope(kind, created.id, created as unknown as T);
      }
      if (kind === 'spell') {
        const draft = body as unknown as Record<string, unknown> & { rolls?: unknown[]; templateLinks?: string[] };
        const { rolls = [], templateLinks, ...spellFields } = draft;
        const created = await api.createSystemSpell({
          ...(spellFields as Record<string, unknown>),
          system: systemSlug,
          ...scope,
        } as Record<string, unknown>);

        const existingRolls = await api.getSpellRolls(created.id);
        const existingNames = new Set(existingRolls.map((r) => r.name));
        for (const roll of rolls) {
          const cleaned = stripFields(roll as Identified, TRANSIENT_ROLL_FIELDS);
          if (existingNames.has(cleaned.name as string)) continue;
          delete cleaned.id;
          await api.createRollEntry({ ...cleaned, ownerType: 'spell', ownerId: created.id });
        }

        if (Array.isArray(templateLinks) && templateLinks.length > 0) {
          await api.setSpellTemplateLinks(created.id, templateLinks);
        }

        return envelope(kind, created.id, created as unknown as T);
      }
      throw new Error(`arcanaApiTransport: unsupported upsert kind "${kind}"`);
    },
    patch: async <T,>(kind: SyncKind, id: string, body: Partial<T> & { externalUpdatedAt?: string }): Promise<SyncEnvelope<T>> => {
      if (kind === 'item') {
        const supportsBuild = systemSlug === 'aa-v2' || systemSlug === 'aa-v3';
        const draft = body as unknown as Partial<ItemDraft> & { buildRecipe?: { outputQuantity?: number; ingredients?: any[] } | null };
        const { rolls, craftRecipes, templateLinks, buildRecipe, ...itemFields } = draft;
        const updated = await api.updateSystemItem(id, itemFields as Partial<ApiItem>);

        if (Array.isArray(rolls)) {
          // Fail-closed: do not default `existing` to [] on fetch error. An
          // empty fallback would cause every server-side roll to look "missing"
          // and be deleted in the diff loop below.
          const existing = await api.getItemRolls(id);
          const newIds = new Set(
            rolls.filter((r): r is typeof r & { id: string } => typeof (r as Identified).id === 'string')
              .map((r) => (r as Identified).id as string),
          );
          for (const old of existing) {
            if (!newIds.has(old.id)) await api.deleteRollEntry(old.id);
          }
          const existingById = new Map(existing.map((r) => [r.id, r]));
          for (const roll of rolls) {
            const cleaned = stripFields(roll as Identified, TRANSIENT_ROLL_FIELDS);
            const rid = cleaned.id as string | undefined;
            if (rid && existingById.has(rid)) {
              const { id: _omit, ...rest } = cleaned;
              await api.updateRollEntry(rid, rest);
            } else {
              delete cleaned.id;
              await api.createRollEntry({ ...cleaned, ownerType: 'item', ownerId: id });
            }
          }
        }

        if (Array.isArray(craftRecipes)) {
          // Fail-closed: same rationale as the rolls section above.
          const existing = await api.getCraftRecipes(id);
          const newIds = new Set(
            craftRecipes.filter((r): r is typeof r & { id: string } => typeof (r as Identified).id === 'string')
              .map((r) => (r as Identified).id as string),
          );
          for (const old of existing) {
            if (!newIds.has(old.id)) await api.deleteCraftRecipe(old.id);
          }
          const existingById = new Map(existing.map((r) => [r.id, r]));
          for (const recipe of craftRecipes) {
            const cleaned = stripFields(recipe as Identified, TRANSIENT_RECIPE_FIELDS);
            const rid = cleaned.id as string | undefined;
            if (rid && existingById.has(rid)) {
              const { id: _omit, ...rest } = cleaned;
              await api.updateCraftRecipe(rid, rest);
            } else {
              delete cleaned.id;
              await api.createCraftRecipe(id, cleaned);
            }
          }
        }

        if (Array.isArray(templateLinks)) {
          await api.setItemTemplateLinks(id, templateLinks);
        }

        if (supportsBuild && buildRecipe !== undefined) {
          const ingredients = buildRecipe?.ingredients;
          if (Array.isArray(ingredients) && ingredients.length > 0) {
            await api.saveItemBuildRecipe(id, {
              outputQuantity: buildRecipe?.outputQuantity ?? 1,
              ingredients: ingredients.map((ing: any) => ({ itemId: ing.itemId ?? null, itemName: ing.itemName ?? '', quantity: ing.quantity ?? 1 })),
            });
          } else {
            await api.deleteItemBuildRecipe(id);
          }
        }

        return envelope(kind, id, updated as unknown as T);
      }
      if (kind === 'spell') {
        const draft = body as unknown as Record<string, unknown> & { rolls?: unknown[]; templateLinks?: string[] };
        const { rolls, templateLinks, ...spellFields } = draft;
        const updated = await api.updateSystemSpell(id, spellFields as Record<string, unknown>);

        if (Array.isArray(rolls)) {
          const existing = await api.getSpellRolls(id);
          const newIds = new Set(
            rolls.filter((r): r is typeof r & { id: string } => typeof (r as Identified).id === 'string')
              .map((r) => (r as Identified).id as string),
          );
          for (const old of existing) {
            if (!newIds.has(old.id)) await api.deleteRollEntry(old.id);
          }
          const existingById = new Map(existing.map((r) => [r.id, r]));
          for (const roll of rolls) {
            const cleaned = stripFields(roll as Identified, TRANSIENT_ROLL_FIELDS);
            const rid = cleaned.id as string | undefined;
            if (rid && existingById.has(rid)) {
              const { id: _omit, ...rest } = cleaned;
              await api.updateRollEntry(rid, rest);
            } else {
              delete cleaned.id;
              await api.createRollEntry({ ...cleaned, ownerType: 'spell', ownerId: id });
            }
          }
        }

        if (Array.isArray(templateLinks)) {
          await api.setSpellTemplateLinks(id, templateLinks);
        }

        return envelope(kind, id, updated as unknown as T);
      }
      throw new Error(`arcanaApiTransport: unsupported patch kind "${kind}"`);
    },
    delete: async (kind: SyncKind, id: string) => {
      if (kind === 'item') {
        await api.deleteSystemItem(id);
        return { ok: true as const };
      }
      if (kind === 'spell') {
        await api.deleteSystemSpell(id);
        return { ok: true as const };
      }
      throw new Error(`arcanaApiTransport: unsupported delete kind "${kind}"`);
    },
  };
}

export const ArcanaModalChrome: HostModalComponent = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-3xl max-h-[90vh] flex flex-col">
      <DialogHeader className="shrink-0">
        <DialogTitle className="text-amber-500">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="text-stone-400">{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <div className="flex-1 overflow-y-auto pr-4 min-h-0">{children}</div>
      {footer ? <DialogFooter className="shrink-0">{footer}</DialogFooter> : null}
    </DialogContent>
  </Dialog>
);

interface BrowserState {
  open: boolean;
  title?: string;
}

export function useImageBrowserBridge() {
  const [state, setState] = useState<BrowserState>({ open: false });
  const resolverRef = useRef<((v: { url: string } | null) => void) | null>(null);

  const imagePicker = useCallback(
    (opts: ImagePickerOpts) =>
      new Promise<{ url: string } | null>((resolve) => {
        resolverRef.current = resolve;
        setState({ open: true, title: opts.title });
      }),
    [],
  );

  const handleSelect = (data: string) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState({ open: false });
    r?.({ url: data });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      const r = resolverRef.current;
      resolverRef.current = null;
      setState({ open: false });
      r?.(null);
    }
  };

  const element = (
    <ImageBrowser
      open={state.open}
      onOpenChange={handleOpenChange}
      onSelect={handleSelect}
      title={state.title ?? 'Select Image'}
    />
  );

  return { imagePicker, element };
}
