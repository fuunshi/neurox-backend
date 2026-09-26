import { CURRICULUM_KIND } from "@/common/constant/enums/curriculum-kind.enum";
import { defineEntity, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";

/**
 * One node of the syllabus tree: a course, a semester, a subject or a unit.
 *
 * **One table rather than four.** The four levels carry identical columns —
 * slug, title, order, SEO fields — so four tables would mean four copies of
 * each and a four-way join to render a single breadcrumb. Adding a stream later
 * (BSc CSIT beside BCA) is then a row rather than a migration. The cost is that
 * the structure cannot enforce "a unit's parent is a subject" in the schema;
 * `taxonomy.service.ts` owns that rule instead, and it is the only writer.
 *
 * **`path` is the key this table is actually read by.** Every page below a
 * course is addressed by its full path — `bca/semester-5/data-structures` — so
 * a breadcrumb, a subtree listing and an index page are all one indexed lookup
 * prefix rather than a recursive walk. It is maintained on save; a slug change
 * rewrites descendants in `slug.service.ts`, which is also what writes the
 * `content_redirect` row that keeps the old URL alive.
 *
 * `path` is unique including soft-deleted rows, deliberately. A deleted node
 * keeps its URL reserved rather than freeing it for a different subject to
 * inherit — a ranked URL silently reused by unrelated content is worse than a
 * restore, and restoring the row is the intended way back.
 */
const CurriculumNodeSchema = defineEntity({
  name: "CurriculumNode",
  tableName: "curriculum_node",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    parent: () =>
      p.manyToOne(CurriculumNode).joinColumn("parent_id").nullable(),
    kind: p.enum(() => CURRICULUM_KIND).nativeEnumName("curriculum_kind"),
    slug: p.string(),
    title: p.string(),
    /**
     * The syllabus code — `BCA 201`, `CACS201`.
     *
     * Kept because students search by it, and because the same subject carries
     * a different code under each curriculum. A subject page shows it beside
     * the title and its metadata includes it.
     */
    code: p.string().nullable(),
    /** Full path from the root, e.g. `bca/semester-5/data-structures`. */
    path: p.string().unique(),
    /**
     * Distance from the root: COURSE is 0, UNIT is 3.
     *
     * Stored rather than derived so "give me everything under this node" is a
     * path prefix query, and so a depth check on write is a comparison instead
     * of a walk.
     */
    depth: p.integer(),
    /** Display order among siblings. TU numbers its semesters; units follow the
     *  syllabus. Not unique — a reorder rewrites several rows at once. */
    ordinal: p.integer().default(0),
    /** Shown on the index page and used as its meta description when no
     *  `seoDescription` is set. */
    description: p.text().nullable(),
    seoTitle: p.string().fieldName("seo_title").nullable(),
    seoDescription: p.text().fieldName("seo_description").nullable(),
    /** Excludes the page from search engines without unpublishing it. */
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
    // Listing a node's children in display order.
    { properties: ["parent", "ordinal"] },
    // The course picker and any "all subjects" listing.
    { properties: ["kind", "ordinal"] },
    { properties: ["deletedAt"] },
    /**
     * Serves `path LIKE 'bca/semester-5/%'` — "everything under this node",
     * which is how every listing below a course is built.
     *
     * The `C` collation is the whole point and is not cosmetic. A plain btree
     * can only serve a prefix match when the column sorts under the C collation,
     * and this database is `en_US.UTF-8`, where it cannot — without this the
     * query is a sequential scan of the whole taxonomy. So this index is
     * declared here rather than left to the unique constraint above, which is
     * useless for prefixes.
     */
    { columns: [{ name: "path", collation: "C" }] },
  ],
});

export class CurriculumNode extends CurriculumNodeSchema.class {}
CurriculumNodeSchema.setClass(CurriculumNode);
