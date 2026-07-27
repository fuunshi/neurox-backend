import { Migration } from "@mikro-orm/migrations";

export class Migration20260923085629 extends Migration {
  override name = "Migration20260923085629";

  override up(): void | Promise<void> {
    this.addSql(
      `create type "source_type" as enum ('TEXT', 'MARKDOWN', 'TXT', 'PDF', 'DOCX');`,
    );
    this.addSql(
      `create type "source_status" as enum ('PENDING', 'EXTRACTING', 'READY', 'FAILED');`,
    );
    this.addSql(
      `create type "generation_job_status" as enum ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');`,
    );
    this.addSql(
      `create type "card_status" as enum ('DRAFT', 'ACTIVE', 'ARCHIVED');`,
    );
    this.addSql(
      `create table "source" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "type" "source_type" not null, "status" "source_status" not null default 'PENDING', "title" varchar(255) not null, "raw_text" text null, "file_name" varchar(255) null, "mime_type" varchar(255) not null, "size_bytes" int null, "storage_path" varchar(255) null, "error" text null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(`create index "source_user_id_index" on "source" ("user_id");`);
    this.addSql(`create index "source_status_index" on "source" ("status");`);
    this.addSql(
      `create index "source_deleted_at_index" on "source" ("deleted_at");`,
    );
    this.addSql(
      `create index "source_user_id_created_at_index" on "source" ("user_id", "created_at");`,
    );

    this.addSql(
      `create table "deck" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "title" varchar(255) not null, "description" text null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(`create index "deck_user_id_index" on "deck" ("user_id");`);
    this.addSql(
      `create index "deck_deleted_at_index" on "deck" ("deleted_at");`,
    );
    this.addSql(
      `create index "deck_user_id_created_at_index" on "deck" ("user_id", "created_at");`,
    );

    this.addSql(
      `create table "generation_job" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "source_id" uuid not null, "deck_id" uuid not null, "status" "generation_job_status" not null default 'PENDING', "provider" varchar(255) not null, "model" varchar(255) null, "cards_requested" int null, "cards_created" int not null default 0, "error" text null, "started_at" timestamptz null, "finished_at" timestamptz null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "generation_job_user_id_index" on "generation_job" ("user_id");`,
    );
    this.addSql(
      `create index "generation_job_source_id_index" on "generation_job" ("source_id");`,
    );
    this.addSql(
      `create index "generation_job_deck_id_index" on "generation_job" ("deck_id");`,
    );
    this.addSql(
      `create index "generation_job_status_index" on "generation_job" ("status");`,
    );
    this.addSql(
      `create index "generation_job_deleted_at_index" on "generation_job" ("deleted_at");`,
    );
    this.addSql(
      `create index "generation_job_user_id_created_at_index" on "generation_job" ("user_id", "created_at");`,
    );

    this.addSql(
      `create table "flash_card" ("id" uuid not null default gen_random_uuid(), "deck_id" uuid not null, "generation_job_id" uuid null, "front" text not null, "back" text not null, "hint" text null, "status" "card_status" not null default 'DRAFT', "position" int null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "flash_card_deck_id_index" on "flash_card" ("deck_id");`,
    );
    this.addSql(
      `create index "flash_card_status_index" on "flash_card" ("status");`,
    );
    this.addSql(
      `create index "flash_card_deleted_at_index" on "flash_card" ("deleted_at");`,
    );
    this.addSql(
      `create index "flash_card_deck_id_status_index" on "flash_card" ("deck_id", "status");`,
    );

    this.addSql(
      `alter table "source" add constraint "source_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );

    this.addSql(
      `alter table "deck" add constraint "deck_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );

    this.addSql(
      `alter table "generation_job" add constraint "generation_job_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );
    this.addSql(
      `alter table "generation_job" add constraint "generation_job_source_id_foreign" foreign key ("source_id") references "source" ("id");`,
    );
    this.addSql(
      `alter table "generation_job" add constraint "generation_job_deck_id_foreign" foreign key ("deck_id") references "deck" ("id");`,
    );

    this.addSql(
      `alter table "flash_card" add constraint "flash_card_deck_id_foreign" foreign key ("deck_id") references "deck" ("id");`,
    );
    this.addSql(
      `alter table "flash_card" add constraint "flash_card_generation_job_id_foreign" foreign key ("generation_job_id") references "generation_job" ("id") on delete set null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "generation_job" drop constraint "generation_job_source_id_foreign";`,
    );
    this.addSql(
      `alter table "generation_job" drop constraint "generation_job_deck_id_foreign";`,
    );
    this.addSql(
      `alter table "flash_card" drop constraint "flash_card_deck_id_foreign";`,
    );
    this.addSql(
      `alter table "flash_card" drop constraint "flash_card_generation_job_id_foreign";`,
    );

    this.addSql(`drop table if exists "source" cascade;`);
    this.addSql(`drop table if exists "deck" cascade;`);
    this.addSql(`drop table if exists "generation_job" cascade;`);
    this.addSql(`drop table if exists "flash_card" cascade;`);

    this.addSql(`drop type "source_type";`);
    this.addSql(`drop type "source_status";`);
    this.addSql(`drop type "generation_job_status";`);
    this.addSql(`drop type "card_status";`);
  }
}
