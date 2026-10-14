// One-off campaigns set up for specific accounts on deploy: an Agnostic
// campaign with a starter kit already in it, owned by that account as GM.
// Each runs once. A marker in agnostic_scope_meta records that it's done, so
// deleting or renaming the campaign later never brings it back.
import { storage } from "../storage";
import * as repo from "./repo";
import { getStore } from "./store";
import { applyCAKit } from "./kits/ca";

interface Provision { email: string; campaignName: string; kit: "ca" }

const PROVISIONS: Provision[] = [
  { email: "reedmcaleb@gmail.com", campaignName: "Cultivator's Adventure (Agnostic)", kit: "ca" },
];

async function provision(p: Provision) {
  const marker = `provision:${p.kit}-kit:${p.email.toLowerCase()}`;
  if ((await repo.getSeedLevel(marker)) > 0) return;
  const user = await storage.getUserByEmail(p.email);
  if (!user) {
    console.log(`[agnostic] provisioning: no account for ${p.email} yet; will try again next start`);
    return;
  }

  // A start that stopped halfway left the campaign behind: carry on with it.
  const { created } = await storage.getUserCampaigns(user.id);
  let campaign = created.find((c: any) => c.name === p.campaignName && c.system === "agnostic");
  if (!campaign) {
    campaign = await storage.createCampaign({
      name: p.campaignName,
      inviteCode: "ARCANA-" + Math.floor(1000 + Math.random() * 9000),
      gmUserId: user.id,
      gridSize: 50,
      system: "agnostic",
    });
    await storage.addCampaignMember({ campaignId: campaign.id, userId: user.id, role: "gm" });
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
  }

  const store = await getStore({ kind: "campaign", id: campaign.id });
  const hasKit = Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Character");
  if (!hasKit) await store.run((cs) => applyCAKit(store, cs, { examples: true }));
  await repo.setSeedLevel(marker, 1);
  console.log(`[agnostic] provisioning: "${p.campaignName}" is ready for ${p.email}`);
}

export async function runAgnosticProvisioning() {
  for (const p of PROVISIONS) {
    try { await provision(p); }
    catch (e) { console.error(`[agnostic] provisioning for ${p.email} failed; will try again next start`, e); }
  }
}
