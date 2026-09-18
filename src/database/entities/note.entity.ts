import { CONTENT_STATUS } from "@/common/constant/enums/content-status.enum";
import { defineEntity, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { CurriculumNode } from "./curriculum-node.entity";

/**
 * A long-form study note: the thing this site is actually made of.
 *
 * Public iff `status = PUBLISHED` **and** `publishedAt <= now()`. Both are
 * required, and the pair is deliberately the whole scheduling mechanism: a note
 * scheduled for next Monday is `PUBLISHED` with a future `publishedAt`, so
 * there is no third state and no second timestamp that could disagree with the
 * first. `content.service.ts` holds the one predicate.
 *
 * **No `scheduledFor` column and no `keywords`.** The first would duplicate
 * `publishedAt` and give the two a way to disagree. The second is the meta
 * keywords field, which search engines have ignored for years — it would be a
 * column that costs an array mapping and returns nothing.
 *
 * Self-referential relation to `CurriculumNode` rather than an owning course:
 * a note hangs off the unit (or subject) it belongs to, and that node already
 * knows its course and semester through `path`.
 */
const NoteSchema = defineEntity({
  name: "Note",
  tableName: "note",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    curriculumNode: () =>
      p.manyToOne(CurriculumNode).joinColumn("curriculum_node_id"),
    /** Globally unique, and unique across soft-deleted rows too: the URL is the
     *  identity of a document, and a deleted note must not free its address for
     *  a different one to inherit. */
    slug: p.string().unique(),
    title: p.string(),
    /** One or two sentences, for index listings and as the meta description
     *  when no `seoDescription` is set. */
    excerpt: p.text().nullable(),
    /** Markdown, rendered to React on the frontend. Never HTML. */
    bodyMarkdown: p.text().fieldName("body_markdown"),
    status: p
      .enum(() => CONTENT_STATUS)
      .nativeEnumName("content_status")
      .default(CONTENT_STATUS.DRAFT),
    publishedAt: p.datetime().fieldName("published_at").nullable(),
    /** Computed from the body when it is written, not from the rendered page —
     *  a reading estimate should not depend on the reader's viewport. */
    readingMinutes: p.integer().fieldName("reading_minutes").nullable(),
    seoTitle: p.string().fieldName("seo_title").nullable(),
    seoDescription: p.text().fieldName("seo_description").nullable(),
    /** Set when this note is also published somewhere else, so the other copy
     *  is credited with the canonical. Null means this URL is canonical. */
    canonicalUrl: p.string().fieldName("canonical_url").nullable(),
    noindex: p.boolean().default(false),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .fieldName("updated_at")
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
  filters: softDeleteFilters,
  indexes: [
    // Listing a node's published notes.
    { properties: ["curriculumNode", "publishedAt"] },
    { properties: ["status", "publishedAt"] },
    { properties: ["deletedAt"] },
    /**
     * The sitemap and the "recently published" list both ask exactly this
     * question — published, newest first — and would otherwise read the table
     * to answer it. Partial, because a draft is invisible to every query that
     * uses it, so indexing drafts would only slow down writes.
     */
    {
      properties: ["publishedAt"],
      where: { status: CONTENT_STATUS.PUBLISHED, deletedAt: null },
    },
  ],
});

export class Note extends NoteSchema.class {}
NoteSchema.setClass(Note);
