import { useCallback, useMemo, useState } from "react";
import {
  arcanaSessionHostAdapter,
  type HostAdapter,
  type LibraryTransport,
  type ImagePickerOpts,
  type NotifyLevel,
} from "@arcana/library-dialogs";
import type { SyncKind, SyncEnvelope } from "@arcana/library-dialogs";
import "@arcana/library-dialogs/theme.css";
import { ImageBrowser } from "@/components/ImageBrowser";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function envelope<T>(kind: SyncKind, data: T): SyncEnvelope<T> {
  const row = data as { id?: string; externalId?: string | null } | null | undefined;
  return {
    kind,
    id: row?.id ?? "",
    externalId: row?.externalId ?? null,
    data,
  };
}

function notImpl(kind: SyncKind, op: string): never {
  throw new Error(`[libraryDialogsHost] ${op}('${kind}') is not implemented yet`);
}

/**
 * Context the shim needs to translate dialog kinds → REST endpoints.
 *
 * `systemSlug` (`"aa-v2"` / `"arcana-adventure"`) is what most system-
 * scoped endpoints expect on the query string and request body
 * (`system: ...`).
 *
 * `systemDisplayName` (`"A.A. V2"` / `"Arcana Adventure"`) is what the
 * `system_species` table stores on the `systemName` column. Mixing the
 * two regresses non-admin species creation (the server enforces the
 * display name for non-admin libraries — see `server/routes.ts`
 * `/api/admin/system-species` POST handler).
 */
export interface ArcanaApiTransportContext {
  systemSlug: string;
  systemDisplayName: string;
  /**
   * When true, all list reads request the caller's personal library scope
   * (`?personal=1`) and all creates tag the body with `personal: true` so the
   * server stores the row under the caller's user id — even for admins. Powers
   * the in-campaign "My Library" surface.
   */
  personal?: boolean;
  /**
   * When set, the library surface is scoped to a single World (Task #120).
   * List reads request `?worldId=...` and creates tag the body with
   * `worldId` so the server stores/authorizes the row against that world
   * instead of the personal/admin library. `personal` is ignored in this
   * mode (world access governs read/write).
   */
  worldId?: string;
}

/**
 * LibraryTransport shim that wraps Arcana's existing session-cookie
 * REST `api.*` methods. Eight kinds covered: item, spell, roll-template,
 * species, feat-tree, class, character, character-template.
 *
 * Class methods (`api.getClasses` / `createClass` / `updateClass` /
 * `deleteClass`) don't exist on the REST client yet, so the `class`
 * branch deliberately throws "not implemented". The follow-up task that
 * swaps the Class admin dialog will add those methods first.
 */
export function createArcanaApiTransport(
  ctx: ArcanaApiTransportContext,
): LibraryTransport {
  const { systemSlug, systemDisplayName, personal, worldId } = ctx;
  // In world mode the personal scope is irrelevant — world access governs it.
  const scopePersonal = worldId ? undefined : personal;

  const transport: LibraryTransport = {
    async list<T>(kind: SyncKind): Promise<{ data: T[] }> {
      switch (kind) {
        case "item":              return { data: (await api.getSystemItems(systemSlug, undefined, scopePersonal, worldId)) as T[] };
        case "spell":             return { data: (await api.getSystemSpells(systemSlug, scopePersonal, worldId)) as T[] };
        case "roll-template":     return { data: (await api.getItemTemplates(systemSlug, personal)) as T[] };
        case "species":           return { data: (await api.getSystemSpecies(systemDisplayName, undefined, personal)) as T[] };
        case "feat-tree":         return { data: (await api.getFeatTrees(systemSlug, undefined, personal)) as T[] };
        case "character-template":return { data: (await api.getCharacterTemplates(scopePersonal, worldId)) as T[] };
        case "character":         return { data: [] as T[] };
        case "class":             return notImpl("class", "list");
        default:                  return notImpl(kind, "list");
      }
    },

    async get<T>(kind: SyncKind, id: string): Promise<SyncEnvelope<T>> {
      switch (kind) {
        case "feat-tree": {
          const data = (await api.getFeatTree(id)) as T;
          return envelope("feat-tree", data);
        }
        case "character": {
          const data = (await api.getCharacter(id)) as T;
          return envelope("character", data);
        }
        case "species": {
          const list = await api.getSystemSpecies(systemDisplayName, undefined, personal);
          const data = list.find((s) => s.id === id);
          if (!data) throw new Error(`Species ${id} not found`);
          return envelope("species", data as unknown as T);
        }
        case "character-template": {
          const list = await api.getCharacterTemplates(scopePersonal, worldId);
          const data = list.find((c) => c.id === id);
          if (!data) throw new Error(`Character template ${id} not found`);
          return envelope("character-template", data as unknown as T);
        }
        // Item / spell / roll-template / class get-by-id endpoints don't
        // exist as standalone api.* methods today — the dialogs that
        // need them (Item / Spell / RollTemplate) are migrated by the
        // sibling tasks. Fail loudly so a future migration spots it.
        case "item":
        case "spell":
        case "roll-template":
        case "class":
          return notImpl(kind, "get");
        default:
          return notImpl(kind, "get");
      }
    },

    async upsert<T>(kind: SyncKind, body: T & Record<string, unknown>): Promise<SyncEnvelope<T>> {
      switch (kind) {
        case "item": {
          const scope = worldId ? { worldId } : (personal ? { personal: true } : {});
          const created = await api.createSystemItem({ ...body, system: systemSlug, ...scope } as Record<string, unknown>);
          return envelope("item", created as unknown as T);
        }
        case "spell": {
          const scope = worldId ? { worldId } : (personal ? { personal: true } : {});
          const created = await api.createSystemSpell({ ...body, system: systemSlug, ...scope } as Record<string, unknown>);
          return envelope("spell", created as unknown as T);
        }
        case "roll-template": {
          const created = await api.createItemTemplate({ ...body, system: systemSlug, ...(personal ? { personal: true } : {}) } as Record<string, unknown>);
          return envelope("roll-template", created as unknown as T);
        }
        case "species": {
          const created = await api.createSystemSpecies({ ...body, systemName: systemDisplayName, ...(personal ? { personal: true } : {}) } as Record<string, unknown>);
          return envelope("species", created as unknown as T);
        }
        case "feat-tree": {
          const created = await api.createFeatTree({ ...body, system: systemSlug, ...(personal ? { personal: true } : {}) } as Record<string, unknown>);
          return envelope("feat-tree", created as unknown as T);
        }
        case "character-template": {
          const scope = worldId ? { worldId } : (personal ? { personal: true } : {});
          const created = await api.createCharacterTemplate({ ...body, ...scope } as Record<string, unknown>);
          return envelope("character-template", created as unknown as T);
        }
        case "character": {
          const cid = (body as { campaignId?: string }).campaignId;
          if (!cid) throw new Error("Character upsert requires campaignId in body");
          const created = await api.createCharacter(cid, body as never);
          return envelope("character", created as unknown as T);
        }
        case "class":
          return notImpl("class", "upsert");
        default:
          return notImpl(kind, "upsert");
      }
    },

    async patch<T>(kind: SyncKind, id: string, body: Partial<T> & { externalUpdatedAt?: string }): Promise<SyncEnvelope<T>> {
      switch (kind) {
        case "item":
          return envelope("item", (await api.updateItem(id, body as Record<string, unknown>)) as unknown as T);
        case "spell":
          return envelope("spell", (await api.updateSystemSpell(id, body as Record<string, unknown>)) as unknown as T);
        case "roll-template":
          return envelope("roll-template", (await api.updateItemTemplate(id, body as Record<string, unknown>)) as unknown as T);
        case "species":
          return envelope("species", (await api.updateSystemSpecies(id, body as Record<string, unknown>)) as unknown as T);
        case "feat-tree":
          return envelope("feat-tree", (await api.updateFeatTree(id, body as Record<string, unknown>)) as unknown as T);
        case "character":
          return envelope("character", (await api.updateCharacter(id, body as Record<string, unknown>)) as unknown as T);
        case "character-template":
          return envelope("character-template", (await api.updateCharacterTemplate(id, body as Record<string, unknown>)) as unknown as T);
        case "class":
          return notImpl("class", "patch");
        default:
          return notImpl(kind, "patch");
      }
    },

    async delete(kind: SyncKind, id: string): Promise<{ ok: true }> {
      switch (kind) {
        case "item":               await api.deleteItem(id); break;
        case "spell":              await api.deleteSystemSpell(id); break;
        case "roll-template":      await api.deleteItemTemplate(id); break;
        case "species":            await api.deleteSystemSpecies(id); break;
        case "feat-tree":          await api.deleteFeatTree(id); break;
        case "character":          await api.deleteCharacter(id); break;
        case "character-template": await api.deleteCharacterTemplate(id); break;
        case "class":              return notImpl("class", "delete");
        default:                   return notImpl(kind, "delete");
      }
      return { ok: true };
    },
  };

  return transport;
}

/**
 * React hook that builds the full HostAdapter for the package's
 * dialogs. Bridges `host.notify` to Arcana's `useToast` (error →
 * destructive variant), `host.imagePicker` to Arcana's `<ImageBrowser>`
 * via promise-resolving controlled state, and auto-invalidates the
 * relevant TanStack Query keys after every successful mutation so list
 * views stay in sync — matches the behavior of the inline mutations
 * being replaced.
 *
 * Returns `{ host, imageBrowserNode }`. Render `imageBrowserNode` once
 * inside the component tree so the imagePicker promise resolves
 * correctly.
 */
export function useLibraryDialogsHost(systemSlug: string, systemDisplayName: string, personal?: boolean, worldId?: string): {
  host: HostAdapter;
  imageBrowserNode: React.ReactNode;
} {
  const { toast } = useToast();
  const [picker, setPicker] = useState<{
    open: boolean;
    title?: string;
    resolve?: (v: { url: string } | null) => void;
  }>({ open: false });

  const transport = useMemo(
    () => createArcanaApiTransport({ systemSlug, systemDisplayName, personal, worldId }),
    [systemSlug, systemDisplayName, personal, worldId],
  );

  const notify = useCallback(
    (level: NotifyLevel, message: string) => {
      toast({
        title: message,
        variant: level === "error" ? "destructive" : "default",
      });
    },
    [toast],
  );

  const imagePicker = useCallback(
    (opts: ImagePickerOpts) =>
      new Promise<{ url: string } | null>((resolve) => {
        setPicker({ open: true, title: opts.title, resolve });
      }),
    [],
  );

  const wrappedTransport = useMemo<LibraryTransport>(() => ({
    list: (kind) => transport.list(kind),
    get: (kind, id) => transport.get(kind, id),
    upsert: async (kind, body) => {
      const env = await transport.upsert(kind, body);
      invalidateForKind(kind);
      return env;
    },
    patch: async (kind, id, body) => {
      const env = await transport.patch(kind, id, body);
      invalidateForKind(kind);
      return env;
    },
    delete: async (kind, id) => {
      const r = await transport.delete(kind, id);
      invalidateForKind(kind);
      return r;
    },
  }), [transport]);

  const host = useMemo<HostAdapter>(
    () => arcanaSessionHostAdapter({
      transport: wrappedTransport,
      notify,
      imagePicker,
    }),
    [wrappedTransport, notify, imagePicker],
  );

  const imageBrowserNode = (
    <ImageBrowser
      open={picker.open}
      onOpenChange={(open) => {
        if (!open && picker.resolve) {
          picker.resolve(null);
          setPicker({ open: false });
        }
      }}
      onSelect={(imageBase64) => {
        if (picker.resolve) picker.resolve({ url: imageBase64 });
        setPicker({ open: false });
      }}
      title={picker.title}
    />
  );

  return { host, imageBrowserNode };
}

function invalidateForKind(kind: string) {
  switch (kind) {
    case "item":
    case "spell":
    case "roll-template":
      queryClient.invalidateQueries({ queryKey: ["system-items"] });
      queryClient.invalidateQueries({ queryKey: ["system-spells"] });
      queryClient.invalidateQueries({ queryKey: ["item-templates"] });
      break;
    case "species":
      queryClient.invalidateQueries({ queryKey: ["system-species"] });
      break;
    case "feat-tree":
      queryClient.invalidateQueries({ queryKey: ["feat-trees"] });
      break;
    case "class":
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      break;
    case "character":
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      break;
    case "character-template":
      queryClient.invalidateQueries({ queryKey: ["character-templates"] });
      break;
  }
}
