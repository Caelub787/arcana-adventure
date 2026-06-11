import { Router, type IRouter } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, realmCollaboratorsTable } from "@workspace/db";
import { requireRealmAccess, resolveRealmRole } from "../middlewares/auth";
import { bumpInvalidation } from "../realtime/doc-registry";
import { storage } from "../../storage";

const router: IRouter = Router();

const InviteBody = z.object({
  email: z.string().email().max(320),
  role: z.enum(["editor", "viewer"]),
});
const PatchBody = z.object({
  role: z.enum(["editor", "viewer"]),
});
const AcceptBody = z.object({
  token: z.string().min(8).max(128),
});

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** GET — owner sees full list (members + pending invites); other roles see accepted members only (no email/token). */
router.get(
  "/realms/:realmId/collaborators",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const realmId = req.params["realmId"]!;
    const isOwner = req.realmRole === "owner";
    const where = isOwner
      ? eq(realmCollaboratorsTable.realmId, realmId)
      : and(
          eq(realmCollaboratorsTable.realmId, realmId),
          isNotNull(realmCollaboratorsTable.acceptedAt),
        );
    const rows = await db
      .select()
      .from(realmCollaboratorsTable)
      .where(where);
    const out = rows.map((r) => ({
      id: r.id,
      realmId: r.realmId,
      userId: r.userId,
      role: r.role,
      invitedEmail: isOwner ? r.invitedEmail : null,
      inviteToken: isOwner ? r.inviteToken : null,
      invitedAt: r.invitedAt.toISOString(),
      acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    }));
    res.json(out);
  },
);

/** POST — owner invites by email. Returns the row (and a copyable invite link if pending). */
router.post(
  "/realms/:realmId/collaborators",
  requireRealmAccess("owner"),
  async (req, res): Promise<void> => {
    const realmId = req.params["realmId"]!;
    const parsed = InviteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const email = parsed.data.email.toLowerCase();

    // Reject if an active row already exists for this email on this realm.
    const existing = await db
      .select()
      .from(realmCollaboratorsTable)
      .where(
        and(
          eq(realmCollaboratorsTable.realmId, realmId),
          eq(realmCollaboratorsTable.invitedEmail, email),
        ),
      );
    if (existing.length > 0) {
      res.status(409).json({ error: "An invite for this email already exists" });
      return;
    }

    // Try to resolve the email to an existing host user. If we find one,
    // attach them immediately as an accepted collaborator so they get
    // realm access on next refresh — no link-passing required.
    let existingUserId: string | null = null;
    try {
      const found = await storage.getUserByEmail(email);
      if (found) existingUserId = found.id;
    } catch (err) {
      req.log?.warn(
        { err },
        "host user lookup failed; falling back to token invite",
      );
    }

    const token = existingUserId ? null : newToken();
    const [row] = await db
      .insert(realmCollaboratorsTable)
      .values({
        realmId,
        invitedEmail: email,
        inviteToken: token,
        role: parsed.data.role,
        userId: existingUserId,
        acceptedAt: existingUserId ? new Date() : null,
      })
      .returning();
    bumpInvalidation(row.realmId, "collaborators");
    res.status(201).json({
      id: row.id,
      realmId: row.realmId,
      userId: row.userId,
      role: row.role,
      invitedEmail: row.invitedEmail,
      inviteToken: row.inviteToken,
      invitedAt: row.invitedAt.toISOString(),
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    });
  },
);

/** PATCH — change a member's role. */
router.patch(
  "/realms/:realmId/collaborators/:collaboratorId",
  requireRealmAccess("owner"),
  async (req, res): Promise<void> => {
    const collaboratorId = req.params["collaboratorId"]!;
    const realmId = req.params["realmId"]!;
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .update(realmCollaboratorsTable)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(realmCollaboratorsTable.id, collaboratorId),
          eq(realmCollaboratorsTable.realmId, realmId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Collaborator not found" });
      return;
    }
    bumpInvalidation(row.realmId, "collaborators");
    res.json({
      id: row.id,
      realmId: row.realmId,
      userId: row.userId,
      role: row.role,
      invitedEmail: row.invitedEmail,
      inviteToken: row.inviteToken,
      invitedAt: row.invitedAt.toISOString(),
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    });
  },
);

/** DELETE — remove a member or pending invite. */
router.delete(
  "/realms/:realmId/collaborators/:collaboratorId",
  requireRealmAccess("owner"),
  async (req, res): Promise<void> => {
    const collaboratorId = req.params["collaboratorId"]!;
    const realmId = req.params["realmId"]!;
    const [row] = await db
      .delete(realmCollaboratorsTable)
      .where(
        and(
          eq(realmCollaboratorsTable.id, collaboratorId),
          eq(realmCollaboratorsTable.realmId, realmId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Collaborator not found" });
      return;
    }
    bumpInvalidation(row.realmId, "collaborators");
    res.sendStatus(204);
  },
);

/**
 * POST /api/invites/accept — signed-in user redeems an invite token.
 * If the matching collaborator row is still pending, it gets attached to the
 * caller's user id and marked accepted.
 */
router.post("/invites/accept", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = AcceptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const token = parsed.data.token;

  const [row] = await db
    .select()
    .from(realmCollaboratorsTable)
    .where(eq(realmCollaboratorsTable.inviteToken, token));
  if (!row) {
    res.status(404).json({ error: "Invite not found or already used" });
    return;
  }

  // Bind invites to identity: the signed-in user's email must match the
  // address the invite was sent to. Otherwise anyone with the link could
  // hijack the invite.
  let userEmails: string[] = [];
  try {
    const user = await storage.getUser(userId);
    if (user?.email) userEmails = [user.email.toLowerCase()];
  } catch (err) {
    req.log?.error({ err }, "failed to fetch user for invite acceptance");
    res.status(500).json({ error: "Could not verify identity" });
    return;
  }
  const invitedEmail = (row.invitedEmail ?? "").toLowerCase();
  if (!invitedEmail || !userEmails.includes(invitedEmail)) {
    res.status(403).json({
      error: "This invite was sent to a different email address.",
    });
    return;
  }

  // If the user already has a role on this realm (owner or a previously
  // accepted row), short-circuit.
  const existingRole = await resolveRealmRole(row.realmId, userId);
  if (existingRole) {
    res.json({ realmId: row.realmId, role: existingRole, alreadyMember: true });
    return;
  }

  // Atomic redemption: only consume the row if the token is still present
  // and the invite has not yet been accepted. Concurrent redemptions race
  // here and only one can win.
  const [claimed] = await db
    .update(realmCollaboratorsTable)
    .set({
      userId,
      acceptedAt: new Date(),
      inviteToken: null,
    })
    .where(
      and(
        eq(realmCollaboratorsTable.id, row.id),
        eq(realmCollaboratorsTable.inviteToken, token),
      ),
    )
    .returning();
  if (!claimed) {
    res.status(409).json({ error: "Invite has already been used" });
    return;
  }
  res.json({ realmId: claimed.realmId, role: claimed.role, alreadyMember: false });
});

export default router;
