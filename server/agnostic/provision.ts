// One-off campaigns set up for specific accounts on deploy, owned by that
// account as GM. Each runs once. A marker in agnostic_scope_meta records that
// it's done, so deleting or renaming the campaign later never brings it back.
import { randomUUID } from "crypto";
import type { AgCampaignSettings } from "@shared/agnostic/types";
import { storage } from "../storage";
import * as repo from "./repo";
import { getStore, type ScopeStore, type ChangeSet } from "./store";
import * as snap from "./snapshot";
import { applyCAKit } from "./kits/ca";
import { markSystemSeeded } from "./systemSeed";

interface Provision {
  /** Marker name: never change it for an entry that has shipped. */
  id: string;
  email: string;
  campaignName: string;
  system: "agnostic" | "ca-agnostic";
  /** Fill it with a copy of this campaign of the same GM (by name and system), when it exists. */
  copyFrom?: { name: string; system: string };
}

const PROVISIONS: Provision[] = [
  // An Agnostic campaign with the C.A. starter kit.
  { id: "ca-kit", email: "reedmcaleb@gmail.com", campaignName: "Cultivator's Adventure (Agnostic)", system: "agnostic" },
  // The same, turned into its own system: a copy of that campaign in "CA Agnostic".
  {
    id: "ca-agnostic-copy", email: "reedmcaleb@gmail.com", campaignName: "Cultivator's Adventure", system: "ca-agnostic",
    copyFrom: { name: "Cultivator's Adventure (Agnostic)", system: "agnostic" },
  },
];

async function createCampaign(userId: string, name: string, system: string) {
  const campaign = await storage.createCampaign({
    name,
    inviteCode: "ARCANA-" + Math.floor(1000 + Math.random() * 9000),
    gmUserId: userId,
    gridSize: 50,
    system,
  });
  await storage.addCampaignMember({ campaignId: campaign.id, userId, role: "gm" });
  const scene = await storage.createScene({
    campaignId: campaign.id,
    name: "Default Scene",
    backgroundImage: "/attached_assets/default_battlemap.webp",
    gridEnabled: true,
    gridType: "square",
    gridSize: 50,
    defaultViewX: 0,
    defaultViewY: 0,
    defaultViewZoom: 1,
  });
  await storage.setActiveScene(campaign.id, scene.id);
  return campaign;
}

/** Everything in one campaign's Agnostic data, copied into another (sheets, links, tracker, token bars). */
async function copyCampaignContent(source: ScopeStore, store: ScopeStore, cs: ChangeSet) {
  const idMap = await snap.copyNotes(source, store, Array.from(source.notes.keys()), cs, { keepOwners: true });
  for (const l of Array.from(source.links.values())) {
    const from = idMap.get(l.fromNoteId), to = idMap.get(l.toNoteId);
    if (from && to) await store.putLink({ ...l, id: randomUUID(), fromNoteId: from, toNoteId: to, createdAt: Date.now() }, cs);
  }
  if (source.settings && store.settings) {
    const s: AgCampaignSettings = JSON.parse(JSON.stringify(source.settings), (k, v) => (k === "componentId" && typeof v === "string" ? idMap.get(v) ?? v : v));
    const remapKeys = (rec: Record<string, string>) => Object.fromEntries(Object.entries(rec).filter(([k]) => idMap.has(k)).map(([k, v]) => [idMap.get(k)!, v]));
    await store.putSettings({
      ...s,
      tracker: { ...s.tracker, pinned: s.tracker.pinned.map((id) => idMap.get(id)).filter((x): x is string => !!x), cardByNote: remapKeys(s.tracker.cardByNote ?? {}) },
    }, cs);
  }
}

async function provision(p: Provision) {
  const done = `provision:${p.id}:${p.email.toLowerCase()}`;
  if ((await repo.getSeedLevel(done)) > 0) return;
  const user = await storage.getUserByEmail(p.email);
  if (!user) {
    console.log(`[agnostic] provisioning: no account for ${p.email} yet; will try again next start`);
    return;
  }

  // A start that stopped halfway left the campaign behind: carry on with it.
  const created = (await storage.getUserCampaigns(user.id)).created.filter((c: any) => c.gmUserId === user.id);
  const existing = created.find((c: any) => c.name === p.campaignName && c.system === p.system);
  const campaign = existing ?? await createCampaign(user.id, p.campaignName, p.system);
  const scope = { kind: "campaign" as const, id: campaign.id };

  const source = p.copyFrom && created.find((c: any) => c.name === p.copyFrom!.name && c.system === p.copyFrom!.system);
  if (source) {
    // Its content comes from the copy, not the system's usual starting templates.
    if (!existing) await markSystemSeeded(scope);
    const store = await getStore(scope);
    if (!store.notes.size) {
      const from = await getStore({ kind: "campaign", id: source.id });
      await store.run((cs) => copyCampaignContent(from, store, cs));
    }
  } else {
    // A plain Agnostic campaign gets the kit; a CA Agnostic one already starts with its templates.
    const store = await getStore(scope);
    const hasKit = Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Character");
    if (!hasKit) await store.run((cs) => applyCAKit(store, cs, { examples: true }));
  }
  await repo.setSeedLevel(done, 1);
  console.log(`[agnostic] provisioning: "${p.campaignName}" is ready for ${p.email}`);
}

export async function runAgnosticProvisioning() {
  for (const p of PROVISIONS) {
    try { await provision(p); }
    catch (e) { console.error(`[agnostic] provisioning "${p.id}" for ${p.email} failed; will try again next start`, e); }
  }
}
