// Shared library ACL helpers — single source of truth for admin detection,
// library write/read enforcement, and per-user library scoping. Used by
// server/routes.ts and server/sync/api.ts so the two code paths cannot drift.

import { storage } from "../storage";

export const ADMIN_EMAILS = ['notclaudenot@gmail.com', 'reedmcaleb@gmail.com'];

export async function isAdminUser(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await storage.getUser(userId);
  return user ? (user.isAdmin || ADMIN_EMAILS.includes((user.email || "").toLowerCase())) : false;
}

/**
 * Returns the list of owner-user-IDs whose library rows the caller may read.
 * `undefined` means "all rows" (admin). Empty array means "no rows".
 * Non-admins always see admin/global rows (ownerUserId IS NULL) implicitly +
 * their own user id, plus the campaign GM's id if a member of `campaignId`.
 */
export async function getLibraryScope(
  userId: string | undefined,
  campaignId?: string,
): Promise<string[] | undefined> {
  if (!userId) return [];
  if (await isAdminUser(userId)) return undefined;
  const ids = [userId];
  if (campaignId) {
    const c = await storage.getCampaign(campaignId);
    if (c?.gmUserId) {
      const isMember = c.gmUserId === userId
        || !!(await storage.getCampaignMembership(userId, campaignId));
      if (isMember && !ids.includes(c.gmUserId)) ids.push(c.gmUserId);
    }
  }
  return ids;
}

/**
 * Authorize a write to a library row. Admins can write any row;
 * non-admins can only write rows they own. Sends a 403 and returns false
 * when denied; returns true when permitted.
 */
export async function enforceLibraryWrite(
  req: any,
  res: any,
  ownerUserId: string | null | undefined,
): Promise<boolean> {
  if (await isAdminUser(req.session?.userId)) return true;
  if (ownerUserId && ownerUserId === req.session?.userId) return true;
  res.status(403).json({ error: "You can only modify your own library entries" });
  return false;
}

export async function enforceLibraryRead(
  req: any,
  res: any,
  ownerUserId: string | null | undefined,
): Promise<boolean> {
  if (await isAdminUser(req.session?.userId)) return true;
  if (!ownerUserId) return true;
  if (ownerUserId === req.session?.userId) return true;
  res.status(403).json({ error: "Not authorized to view this library entry" });
  return false;
}

/**
 * Personal library is AA V2 or AA V3 only for non-admins. Sends 400 +
 * returns false when a non-admin tries to use a different system;
 * returns true otherwise. (Function name kept for compatibility — V3
 * was added under the same personal-library policy as V2.)
 */
/**
 * Pure (non-HTTP) library read/write predicates. The HTTP-aware
 * `enforceLibraryRead` / `enforceLibraryWrite` above are thin wrappers
 * around these. Sync (bearer-auth) handlers use these directly so the
 * sync ACL and the REST ACL can never drift.
 */
export function canReadLibraryRow(
  user: { id: string; isAdmin: boolean },
  ownerUserId: string | null | undefined,
): boolean {
  if (user.isAdmin) return true;
  if (ownerUserId == null) return true; // global admin row visible to all
  return ownerUserId === user.id;
}

export function canWriteLibraryRow(
  user: { id: string; isAdmin: boolean },
  ownerUserId: string | null | undefined,
): boolean {
  if (user.isAdmin) return true;
  if (ownerUserId == null) return false; // non-admin cannot write to global admin rows
  return ownerUserId === user.id;
}

export async function requireLibraryAaV2(
  req: any,
  res: any,
  system: string | undefined,
): Promise<boolean> {
  if (await isAdminUser(req.session?.userId)) return true;
  if (system && system !== 'aa-v2' && system !== 'aa-v3') {
    res.status(400).json({ error: "Personal library is only available for the AA V2 and AA V3 systems" });
    return false;
  }
  return true;
}
