import { storage } from "./storage";

/**
 * Shared host world-access check, usable outside the registerRoutes closure
 * (e.g. by the ported Canvas Realms realm-role resolver).
 *
 * Mirrors the `checkWorldAccess` helper defined inside server/routes.ts so the
 * campaign-embedded World Builder can authorize campaign GMs/players against a
 * realm whose id equals the host world id, without requiring an explicit CR
 * collaborator row.
 *
 * `isOwner` means full read/write authority (world owner, world collaborator,
 * or campaign GM/assistant GM). Plain campaign members get read-only access
 * (allowed but not owner).
 */
export async function checkWorldAccessShared(
  userId: string,
  worldId: string,
): Promise<{ allowed: boolean; isOwner: boolean }> {
  const world = await storage.getWorld(worldId);
  if (!world) return { allowed: false, isOwner: false };
  if (world.userId === userId) return { allowed: true, isOwner: true };
  if (await storage.isWorldCollaborator(worldId, userId)) {
    return { allowed: true, isOwner: true };
  }
  if (world.campaignId) {
    const campaign = await storage.getCampaign(world.campaignId);
    if (campaign) {
      if (campaign.gmUserId === userId) return { allowed: true, isOwner: true };
      const user = await storage.getUser(userId);
      if (user?.isAdmin) return { allowed: true, isOwner: true };
      const membership = await storage.getCampaignMembership(
        userId,
        world.campaignId,
      );
      if (membership?.role === "assistant_gm") {
        return { allowed: true, isOwner: true };
      }
      if (await storage.isCampaignMember(world.campaignId, userId)) {
        return { allowed: true, isOwner: false };
      }
    }
  }
  return { allowed: false, isOwner: false };
}

/**
 * Shared host campaign-access check for the campaign-embedded World Builder,
 * whose CR realm reuses the host campaign id as the realm id. Mirrors the
 * GM/member authorization used elsewhere in the host.
 *
 * `isOwner` (full read/write) = campaign GM, assistant GM, or site admin.
 * Plain campaign members get read-only access (allowed but not owner).
 */
export async function checkCampaignAccessShared(
  userId: string,
  campaignId: string,
): Promise<{ allowed: boolean; isOwner: boolean }> {
  const campaign = await storage.getCampaign(campaignId);
  if (!campaign) return { allowed: false, isOwner: false };
  if (campaign.gmUserId === userId) return { allowed: true, isOwner: true };
  const user = await storage.getUser(userId);
  if (user?.isAdmin) return { allowed: true, isOwner: true };
  const membership = await storage.getCampaignMembership(userId, campaignId);
  if (membership?.role === "assistant_gm") return { allowed: true, isOwner: true };
  if (await storage.isCampaignMember(campaignId, userId)) {
    return { allowed: true, isOwner: false };
  }
  return { allowed: false, isOwner: false };
}
