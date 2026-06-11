import { isNull } from "drizzle-orm";
import { db, realmsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * One-time idempotent backfill: when REBORN_BOOTSTRAP_USER_ID is set, any
 * realm with a NULL owner_user_id (i.e. created before auth landed) is
 * assigned to that user so the data isn't orphaned after we start gating
 * access by ownership.
 *
 * Safe to call on every server start.
 */
export async function backfillRealmOwners(): Promise<void> {
  const bootstrapUserId = process.env["REBORN_BOOTSTRAP_USER_ID"];
  if (!bootstrapUserId) return;
  try {
    const updated = await db
      .update(realmsTable)
      .set({ ownerUserId: bootstrapUserId })
      .where(isNull(realmsTable.ownerUserId))
      .returning({ id: realmsTable.id });
    if (updated.length > 0) {
      logger.info(
        { count: updated.length, bootstrapUserId },
        "Backfilled owner_user_id on existing realms",
      );
    }
  } catch (err) {
    logger.error({ err }, "backfillRealmOwners failed");
  }
}
