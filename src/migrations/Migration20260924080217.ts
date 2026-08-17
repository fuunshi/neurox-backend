import { Migration } from "@mikro-orm/migrations";

export class Migration20260924080217 extends Migration {
  override name = "Migration20260924080217";

  override up(): void | Promise<void> {
    this.addSql(
      `create type "review_rating" as enum ('AGAIN', 'HARD', 'GOOD', 'EASY');`,
    );
    this.addSql(
      `create table "card_review" ("id" uuid not null default gen_random_uuid(), "card_id" uuid not null, "user_id" uuid not null, "rating" "review_rating" not null, "interval_before_days" int not null default 0, "interval_after_days" int not null default 0, "ease_after" int not null default 250, "reviewed_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "card_review_card_id_reviewed_at_index" on "card_review" ("card_id", "reviewed_at");`,
    );
    this.addSql(
      `create index "card_review_user_id_reviewed_at_index" on "card_review" ("user_id", "reviewed_at");`,
    );

    this.addSql(
      `alter table "flash_card" add "due_at" timestamptz null, add "interval_days" int not null default 0, add "ease_factor" int not null default 250, add "repetitions" int not null default 0, add "lapses" int not null default 0, add "last_reviewed_at" timestamptz null;`,
    );
    this.addSql(
      `create index "flash_card_deck_id_status_due_at_index" on "flash_card" ("deck_id", "status", "due_at");`,
    );

    this.addSql(
      `alter table "card_review" add constraint "card_review_card_id_foreign" foreign key ("card_id") references "flash_card" ("id");`,
    );
    this.addSql(
      `alter table "card_review" add constraint "card_review_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "card_review" cascade;`);

    this.addSql(`drop index "flash_card_deck_id_status_due_at_index";`);
    this.addSql(
      `alter table "flash_card" drop column "due_at", drop column "interval_days", drop column "ease_factor", drop column "repetitions", drop column "lapses", drop column "last_reviewed_at";`,
    );

    this.addSql(`drop type "review_rating";`);
  }
}
