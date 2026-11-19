import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * The picture to stamp a chat message with: the character the sender is
 * playing in this campaign, or their own if they aren't playing one (or the
 * character has no portrait of its own yet).
 *
 * Only a link is worth keeping. A picture can also be stored spelled out in
 * full as a `data:` URL, and copying one of those onto every line someone
 * says would put megabytes in each row and send the lot again every time the
 * log is opened. Those aren't stamped — the chat works them out live the way
 * it always did, and the next time that picture is set it is saved as a file,
 * so stamping picks up from there.
 *
 * It lives in its own file, and is written out by hand rather than built with
 * the query builder, for two reasons: it is the same expression as the
 * backfill in app.ts and reads better side by side with it, and storage.ts is
 * close enough to the type checker's limit on this schema that three more
 * tables' worth of inference in there tips it into giving up on the
 * self-referential tables and reporting them as `any`.
 */
export async function senderAvatarFor(campaignId: string, userId: string): Promise<string | null> {
  const found: any = await db.execute(sql`
    SELECT COALESCE(ch.portrait, u.avatar_url) AS avatar
      FROM users u
      LEFT JOIN campaign_members cm
        ON cm.user_id = u.id AND cm.campaign_id = ${campaignId}
      LEFT JOIN characters ch ON ch.id = cm.assigned_character_id
     WHERE u.id = ${userId}
     LIMIT 1
  `);
  const avatar = found?.rows?.[0]?.avatar;
  return typeof avatar === "string" && avatar && !avatar.startsWith("data:") ? avatar : null;
}
