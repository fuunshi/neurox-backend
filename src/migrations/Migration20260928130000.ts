import { Migration } from "@mikro-orm/migrations";

/**
 * The public study-material model: the syllabus tree and the notes on it.
 *
 * These are the first tables in this schema that belong to nobody. Every other
 * content-bearing table (`deck`, `flash_card`, `source`, `quiz_attempt`) hangs
 * off a `user_id` and is reachable only by its owner; these are read by anyone,
 * including a crawler with no account at all. That is the whole point of them,
 * and it is why the read endpoints they feed are `@Public()`.
 *
 * `curriculum_node` is self-referencing rather than four tables — see the entity
 * for why. `path` carries the unique constraint and is the column every page
 * below a course is addressed by.
 */
export class Migration20260928130000 extends Migration {
  override name = "Migration20260928130000";

  override up(): void | Promise<void> {
    this.addSql(
      `create type "curriculum_kind" as enum ('COURSE', 'SEMESTER', 'SUBJECT', 'UNIT');`,
    );
    this.addSql(
      `create type "content_status" as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');`,
    );

    this.addSql(
      `create table "curriculum_node" ("id" uuid not null default gen_random_uuid(), "parent_id" uuid null, "kind" "curriculum_kind" not null, "slug" varchar(255) not null, "title" varchar(255) not null, "code" varchar(255) null, "path" varchar(255) not null, "depth" int not null, "ordinal" int not null default 0, "description" text null, "seo_title" varchar(255) null, "seo_description" text null, "noindex" boolean not null default false, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "curriculum_node" add constraint "curriculum_node_path_unique" unique ("path");`,
    );
    this.addSql(
      `create index "curriculum_node_parent_id_ordinal_index" on "curriculum_node" ("parent_id", "ordinal");`,
    );
    this.addSql(
      `create index "curriculum_node_kind_ordinal_index" on "curriculum_node" ("kind", "ordinal");`,
    );
    this.addSql(
      `create index "curriculum_node_deleted_at_index" on "curriculum_node" ("deleted_at");`,
    );
    // Every listing below a course is "everything whose path starts with this".
    // The `C` collation is what makes `path LIKE 'bca/semester-5/%'` an index
    // scan rather than a sequential one — a plain btree can only serve a prefix
    // match when the column sorts under C, and this database is `en_US.UTF-8`.
    this.addSql(
      `create index "curriculum_node_path_index" on "curriculum_node" ("path" collate "C");`,
    );

    this.addSql(
      `create table "note" ("id" uuid not null default gen_random_uuid(), "curriculum_node_id" uuid not null, "slug" varchar(255) not null, "title" varchar(255) not null, "excerpt" text null, "body_markdown" text not null, "status" "content_status" not null default 'DRAFT', "published_at" timestamptz null, "reading_minutes" int null, "seo_title" varchar(255) null, "seo_description" text null, "canonical_url" varchar(255) null, "noindex" boolean not null default false, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "note" add constraint "note_slug_unique" unique ("slug");`,
    );
    this.addSql(
      `create index "note_curriculum_node_id_published_at_index" on "note" ("curriculum_node_id", "published_at");`,
    );
    this.addSql(
      `create index "note_status_published_at_index" on "note" ("status", "published_at");`,
    );
    this.addSql(
      `create index "note_deleted_at_index" on "note" ("deleted_at");`,
    );
    // The sitemap and the "recently published" list both ask exactly this
    // question — published, newest first — and both would otherwise read the
    // whole table to answer it. Partial, because a draft is invisible to every
    // query that uses this index, so indexing drafts would only cost writes.
    this.addSql(
      `create index "note_published_at_index" on "note" ("published_at") where "status" = 'PUBLISHED' and "deleted_at" is null;`,
    );

    this.addSql(
      `alter table "curriculum_node" add constraint "curriculum_node_parent_id_foreign" foreign key ("parent_id") references "curriculum_node" ("id") on delete set null;`,
    );
    this.addSql(
      `alter table "note" add constraint "note_curriculum_node_id_foreign" foreign key ("curriculum_node_id") references "curriculum_node" ("id");`,
    );
  }

  override down(): void | Promise<void> {
    // `note` first: its foreign key points at the node table.
    this.addSql(`drop table if exists "note" cascade;`);
    this.addSql(`drop table if exists "curriculum_node" cascade;`);
    this.addSql(`drop type if exists "content_status";`);
    this.addSql(`drop type if exists "curriculum_kind";`);
  }
}
