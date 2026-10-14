// Systems built on Agnostic (e.g. "C.A. Agnostic") come with their content.
//   Admin library  starts with the system's starter kit (templates only) and is
//                  the system's master copy: change a template there and every
//                  campaign and library made afterwards starts with the change.
//   My Library     starts with a copy of the admin library's templates.
//   Campaigns      start with a copy of the admin library's templates, plus the
//                  system's tracker cards and token bars.
// Each scope is filled once (a marker in agnostic_scope_meta); deleting what
// it got never brings it back. Plain Agnostic starts empty, as before.
import { agnosticSystemKit } from "@shared/systems";
import { agLibraryScope, agLibrarySystem, scopeKey, type AgScope } from "@shared/agnostic/types";
import { storage } from "../storage";
import * as repo from "./repo";
import { getStore, type ScopeStore } from "./store";
import * as snap from "./snapshot";
import { applyCAKit, applyCATrackerSettings } from "./kits/ca";

const marker = (key: string) => `system-seed:${key}`;

export async function systemOfScope(scope: AgScope): Promise<string | null> {
  if (scope.kind !== "campaign") return agLibrarySystem(scope);
  const campaign = await storage.getCampaign(scope.id);
  return (campaign as any)?.system ?? null;
}

/** Record that a scope already has its content (it was filled some other way). */
export async function markSystemSeeded(scope: AgScope) {
  await repo.setSeedLevel(marker(scopeKey(scope)), 1);
}

export async function seedSystemContent(store: ScopeStore) {
  const system = await systemOfScope(store.scope);
  const kit = agnosticSystemKit(system);
  if (!kit || !system) return;
  if ((await repo.getSeedLevel(marker(store.key))) > 0) return;

  if (store.scope.kind === "admin") {
    const hasKit = Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Character");
    if (!hasKit) await store.run((cs) => applyCAKit(store, cs, { examples: false }));
  } else {
    const master = await getStore(agLibraryScope("admin", "", system));
    const templates = Array.from(master.notes.values()).filter((n) => n.isTemplate).map((n) => n.id);
    await store.run(async (cs) => {
      if (templates.length) await snap.copyNotes(master, store, templates, cs);
      else await applyCAKit(store, cs, { examples: false });
      await applyCATrackerSettings(store, cs);
    });
  }
  await repo.setSeedLevel(marker(store.key), 1);
  console.log(`[agnostic] ${system}: filled ${store.key} with the system's templates`);
}
