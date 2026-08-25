import { Migration } from "@mikro-orm/migrations";

export class Migration20260924112343 extends Migration {
  override name = "Migration20260924112343";

  override up(): void | Promise<void> {
    this.addSql(
      `create type "quiz_format" as enum ('MULTIPLE_CHOICE', 'CLOZE', 'MATCHING');`,
    );
    this.addSql(
      `create type "quiz_attempt_status" as enum ('IN_PROGRESS', 'COMPLETED');`,
    );
    this.addSql(
      `create table "quiz_attempt" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "deck_id" uuid not null, "format" "quiz_format" not null, "status" "quiz_attempt_status" not null default 'IN_PROGRESS', "question_count" int not null default 0, "correct_count" int not null default 0, "questions" jsonb not null, "started_at" timestamptz not null, "finished_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "quiz_attempt_user_id_index" on "quiz_attempt" ("user_id");`,
    );
    this.addSql(
      `create index "quiz_attempt_deck_id_index" on "quiz_attempt" ("deck_id");`,
    );
    this.addSql(
      `create index "quiz_attempt_user_id_started_at_index" on "quiz_attempt" ("user_id", "started_at");`,
    );

    this.addSql(
      `create table "quiz_answer" ("id" uuid not null default gen_random_uuid(), "attempt_id" uuid not null, "user_id" uuid not null, "card_id" uuid null, "position" int not null, "chosen" varchar(255) null, "correct" boolean not null default false, "answered_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "quiz_answer_attempt_id_position_index" on "quiz_answer" ("attempt_id", "position");`,
    );
    this.addSql(
      `create index "quiz_answer_user_id_answered_at_index" on "quiz_answer" ("user_id", "answered_at");`,
    );
    this.addSql(
      `create index "quiz_answer_card_id_index" on "quiz_answer" ("card_id");`,
    );
    this.addSql(
      `alter table "quiz_answer" add constraint "quiz_answer_attempt_id_position_unique" unique ("attempt_id", "position");`,
    );

    this.addSql(
      `alter table "quiz_attempt" add constraint "quiz_attempt_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );
    this.addSql(
      `alter table "quiz_attempt" add constraint "quiz_attempt_deck_id_foreign" foreign key ("deck_id") references "deck" ("id");`,
    );

    this.addSql(
      `alter table "quiz_answer" add constraint "quiz_answer_attempt_id_foreign" foreign key ("attempt_id") references "quiz_attempt" ("id");`,
    );
    this.addSql(
      `alter table "quiz_answer" add constraint "quiz_answer_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );
    this.addSql(
      `alter table "quiz_answer" add constraint "quiz_answer_card_id_foreign" foreign key ("card_id") references "flash_card" ("id") on delete set null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "quiz_answer" drop constraint "quiz_answer_attempt_id_foreign";`,
    );

    this.addSql(`drop table if exists "quiz_attempt" cascade;`);
    this.addSql(`drop table if exists "quiz_answer" cascade;`);

    this.addSql(`drop type "quiz_format";`);
    this.addSql(`drop type "quiz_attempt_status";`);
  }
}
