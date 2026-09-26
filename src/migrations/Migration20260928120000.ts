import { Migration } from "@mikro-orm/migrations";

/**
 * Drops `token.token`, the plaintext column.
 *
 * The row has always carried both the raw token and its hash, and only the hash
 * was ever *read* — `verifyToken`, `revokeToken`, every lookup in `auth.service`
 * and every projection filters on `token_hash`. The plaintext existed only
 * because `storeToken` writes it. A database dump therefore handed over live
 * refresh and password-reset tokens for every user, which is the whole of the
 * exposure: the hash is what the application compares against, so nothing needs
 * the original.
 *
 * Verified before writing this, not assumed: no query, projection, `orderBy`,
 * raw `execute()` or serialiser in `src/` or `test/` names the column.
 * `CreateTokenData.token` stays on the interface — it is the *input* to
 * `hashToken`, not a column.
 *
 * **This direction is a one-way door.** The plaintext is not derivable, so
 * `down()` can restore the column's shape and nothing else. It is written to
 * re-add the column nullable for that reason, rather than `not null` as it was:
 * rows created after this migration have no value to backfill, and a `not null`
 * unique column cannot be added over them without deleting them.
 */
export class Migration20260928120000 extends Migration {
  override name = "Migration20260928120000";

  override up(): void | Promise<void> {
    // The constraint is dropped by name first. Dropping the column would take
    // its index with it, but a constraint is not an index and does not go
    // quietly — leaving it behind would fail the column drop.
    this.addSql(
      `alter table "token" drop constraint if exists "token_token_unique";`,
    );
    this.addSql(`alter table "token" drop column if exists "token";`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "token" add column if not exists "token" varchar(500) null;`,
    );
    // Postgres treats NULLs as distinct, so a unique constraint over a nullable
    // column still admits the rows this migration leaves behind.
    this.addSql(
      `alter table "token" add constraint "token_token_unique" unique ("token");`,
    );
  }
}
