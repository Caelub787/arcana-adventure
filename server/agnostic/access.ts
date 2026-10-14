// Who may open an Agnostic scope, and as what.
//   campaign  members (players) and the GM / assistant GMs / site admins (GM)
//   library   only its owner, who is the GM of their own library
//   admin     only site admins, who are GM there
import { storage } from "../storage";
import { isAdminUser } from "../lib/library-acl";
import type { AgScope, AgViewer } from "@shared/agnostic/types";
import { agLibraryOwner, agLibrarySystem } from "@shared/agnostic/types";
import { isAgnosticSystem } from "@shared/systems";

export interface ScopeAccess {
  viewer: AgViewer;
  /** Display names for members, so permission pickers can show people. */
}

export async function resolveScopeAccess(userId: string, scope: AgScope): Promise<AgViewer | null> {
  if (!userId) return null;
  if (scope.kind === "library" || scope.kind === "admin") {
    // Each Agnostic-built system has its own libraries ("<owner>:<system>").
    if (!isAgnosticSystem(agLibrarySystem(scope))) return null;
    const owner = agLibraryOwner(scope);
    if (scope.kind === "library") return owner === userId ? { userId, isGM: true } : null;
    if (owner !== "admin") return null;
    return (await isAdminUser(userId)) ? { userId, isGM: true } : null;
  }
  const campaign = await storage.getCampaign(scope.id);
  if (!campaign) return null;
  if (!isAgnosticSystem((campaign as any).system)) return null;
  if (campaign.gmUserId === userId) return { userId, isGM: true };
  const membership = await storage.getCampaignMembership(userId, scope.id);
  if (membership?.role === "gm" || membership?.role === "assistant_gm") return { userId, isGM: true };
  if (await isAdminUser(userId)) return { userId, isGM: true };
  if (membership) return { userId, isGM: false };
  return null;
}

// Every write re-checks access (people get kicked or promoted mid-session).
// The answer is remembered so that check never sits on the live path: fresh
// for a few seconds; after that the remembered answer is used while a new one
// is fetched in the background, so a kick or promotion lands within a moment
// and nobody waits on the database to change a value.
const ACCESS_FRESH_MS = 5_000;
const ACCESS_STALE_MS = 120_000;
const accessCache = new Map<string, { at: number; viewer: AgViewer | null; refreshing?: boolean }>();
export async function resolveScopeAccessCached(userId: string, scope: AgScope): Promise<AgViewer | null> {
  const key = `${userId}|${scope.kind}:${scope.id}`;
  const hit = accessCache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < ACCESS_FRESH_MS) return hit.viewer;
  if (hit && hit.viewer && age < ACCESS_STALE_MS) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      resolveScopeAccess(userId, scope)
        .then((viewer) => accessCache.set(key, { at: Date.now(), viewer }))
        .catch(() => { hit.refreshing = false; });
    }
    return hit.viewer;
  }
  const viewer = await resolveScopeAccess(userId, scope);
  accessCache.set(key, { at: Date.now(), viewer });
  if (accessCache.size > 5000) for (const [k, v] of Array.from(accessCache)) if (Date.now() - v.at > ACCESS_STALE_MS) accessCache.delete(k);
  return viewer;
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
