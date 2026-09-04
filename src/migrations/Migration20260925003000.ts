import { Migration } from "@mikro-orm/migrations";

/**
 * The notification table.
 *
 * Holds a template key and its parameters, never the rendered sentence — see
 * `application/notification/notification.templates.ts` for why. `params` is
 * jsonb so a template can grow a field without a migration, and `read_at` is
 * nullable so unread is the absence of a timestamp rather than a second flag
 * that can disagree with it.
 *
 * The `(user_id, read_at)` index is the one this table is read by constantly:
 * the unread count is on every page, and it is always those two columns.
 */
export class Migration20260925003000 extends Migration {
  override name = "Migration20260925003000";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "notification" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "type" varchar(64) not null, "params" jsonb not null, "read_at" timestamptz null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(
      `create index "notification_user_id_index" on "notification" ("user_id");`,
    );
    this.addSql(
      `create index "notification_user_id_read_at_index" on "notification" ("user_id", "read_at");`,
    );
    this.addSql(
      `create index "notification_user_id_created_at_index" on "notification" ("user_id", "created_at");`,
    );
    this.addSql(
      `create index "notification_deleted_at_index" on "notification" ("deleted_at");`,
    );

    this.addSql(
      `alter table "notification" add constraint "notification_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );
  }

  override down(): void | Promise<void> {
    // `cascade` so the indexes and the foreign key go with it rather than
    // being left behind to block a re-run.
    this.addSql(`drop table if exists "notification" cascade;`);
  }
}
