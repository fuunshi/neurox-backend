import { EntityManager } from "@mikro-orm/postgresql";

/**
 * The reader's timezone, from their profile.
 *
 * Every aggregate that groups by day asks here first, because a day is the
 * reader's rather than the server's: bucketing in the process's zone makes a
 * streak reset at somebody else's midnight, and moves reviews into the wrong
 * column of a weekday chart for anyone far enough east or west.
 *
 * Falls back to UTC rather than to the server's local zone. A reader with no
 * profile row is one nobody has asked yet, and UTC at least says which clock it
 * used instead of inheriting one from wherever the process happens to run.
 */
export async function userTimezone(
  em: EntityManager,
  userId: string,
): Promise<string> {
  const rows = await em.getConnection().execute<Array<{ timezone: string }>>(
    `select coalesce(p."timezone", 'UTC') as timezone
       from "user_profile" p
      where p."user_id" = ? and p."deleted_at" is null
      limit 1`,
    [userId],
  );

  return rows[0]?.timezone || "UTC";
}
