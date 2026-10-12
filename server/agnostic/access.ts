// Who may open an Agnostic scope, and as what.
//   campaign  members (players) and the GM / assistant GMs / site admins (GM)
//   library   only its owner, who is the GM of their own library
//   admin     only site admins, who are GM there
import { storage } from "../storage";
import { isAdminUser } from "../lib/library-acl";
import type { AgScope, AgViewer } from "@shared/agnostic/types";

export interface ScopeAccess {
  viewer: AgViewer;
  /** Display names for members, so permission pickers can show people. */
}

export async function resolveScopeAccess(userId: string, scope: AgScope): Promise<AgViewer | null> {
  if (!userId) return null;
  if (scope.kind === "library") {
    return scope.id === userId ? { userId, isGM: true } : null;
  }
  if (scope.kind === "admin") {
    return (await isAdminUser(userId)) ? { userId, isGM: true } : null;
  }
  const campaign = await storage.getCampaign(scope.id);
  if (!campaign) return null;
  if ((campaign as any).system !== "agnostic") return null;
  if (campaign.gmUserId === userId) return { userId, isGM: true };
  const membership = await storage.getCampaignMembership(userId, scope.id);
  if (membership?.role === "gm" || membership?.role === "assistant_gm") return { userId, isGM: true };
  if (await isAdminUser(userId)) return { userId, isGM: true };
  if (membership) return { userId, isGM: false };
  return null;
}

export interface MemberInfo {
  userId: string;
  name: string;
  role: string;
}

export async function scopeMembers(scope: AgScope): Promise<MemberInfo[]> {
  if (scope.kind !== "campaign") return [];
  const members = await storage.getCampaignMembers(scope.id);
  return (members as any[]).map((m) => ({
    userId: m.userId,
    name: m.user?.username || m.username || m.user?.name || "Player",
    role: m.role || "player",
  }));
}
