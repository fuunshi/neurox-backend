import { CONTENT_STATUS } from "@/common/constant/enums";
import { CurriculumNode, Note } from "@/database/entities";
import { Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { TaxonomyService } from "./taxonomy.service";
import {
  NoteDetailDTO,
  NoteListQueryDTO,
  NoteSummaryDTO,
} from "./dto/content.dto";

/**
 * The public predicate, as a concrete type.
 *
 * Declared rather than inferred so the two callers can spread it into their own
 * filter without colliding with `FilterQuery<T>` — that type is a union wide
 * enough to include `RegExp`, and property access on it does not typecheck.
 */
interface PublicNoteFilter {
  status: typeof CONTENT_STATUS.PUBLISHED;
  publishedAt: { $lte: Date };
}

/**
 * Reading published study material.
 *
 * The one rule this service exists to hold: **a note is public iff it is
 * `PUBLISHED` and its `publishedAt` has passed.** That pair is the entire
 * scheduling mechanism — a note set for next Monday is simply `PUBLISHED` with
 * a future timestamp — and it lives in `publicWhere()` alone so that no caller
 * can implement half of it. A read that checked only `status` would publish
 * every scheduled note early; one that checked only the date would publish
 * drafts.
 *
 * Nothing here takes a user id, and nothing here ever should: these rows belong
 * to nobody, which is what makes every response cacheable and shareable.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly em: EntityManager,
    private readonly taxonomy: TaxonomyService,
  ) {}

  /** The only place the public predicate is written. */
  private publicWhere(): PublicNoteFilter {
    return {
      status: CONTENT_STATUS.PUBLISHED,
      publishedAt: { $lte: new Date() },
    };
  }

  /** One published note by slug, with its body and breadcrumb trail. */
  async getNoteBySlug(slug: string): Promise<NoteDetailDTO> {
    const note = await this.em.findOne(
      Note,
      { ...this.publicWhere(), slug },
      { populate: ["curriculumNode"] },
    );

    // A draft and a note that never existed both answer 404. Distinguishing
    // them would turn this endpoint into a way to enumerate unpublished work.
    if (!note) {
      throw new NotFoundException("No such note.");
    }

    const breadcrumbs = await this.taxonomy.breadcrumbsFor(
      note.curriculumNode.path,
    );

    return {
      ...this.toSummary(note),
      bodyMarkdown: note.bodyMarkdown,
      seoTitle: note.seoTitle ?? null,
      seoDescription: note.seoDescription ?? null,
      canonicalUrl: note.canonicalUrl ?? null,
      noindex: note.noindex,
      breadcrumbs,
    };
  }

  /**
   * Published notes, newest first, optionally under one node.
   *
   * The subtree filter is two queries rather than a join, and deliberately:
   * `path LIKE 'bca/semester-5/%'` is served by the C-collation index on
   * `curriculum_node`, and resolving those ids first keeps the note query on
   * its own `(curriculum_node_id, published_at)` index. A correlated subquery
   * would use one or the other.
   */
  async listNotes(query: NoteListQueryDTO): Promise<NoteSummaryDTO[]> {
    const nodeIds = query.path ? await this.nodesUnder(query.path) : null;

    const notes = await this.em.find(
      Note,
      {
        ...this.publicWhere(),
        ...(nodeIds ? { curriculumNode: { id: { $in: nodeIds } } } : {}),
      },
      {
        populate: ["curriculumNode"],
        orderBy: { publishedAt: "desc" },
        limit: query.limit,
      },
    );

    return notes.map((note) => this.toSummary(note));
  }

  /** Ids of the node at `path` and everything beneath it. */
  private async nodesUnder(path: string): Promise<string[]> {
    const nodes = await this.em.find(
      CurriculumNode,
      {
        $or: [{ path }, { path: { $like: `${path}/%` } }],
      },
      { fields: ["id"] },
    );

    return nodes.map((node) => node.id);
  }

  private toSummary(note: Note): NoteSummaryDTO {
    return {
      id: note.id,
      slug: note.slug,
      title: note.title,
      excerpt: note.excerpt ?? null,
      publishedAt: note.publishedAt ?? null,
      readingMinutes: note.readingMinutes ?? null,
      nodePath: note.curriculumNode.path,
      nodeTitle: note.curriculumNode.title,
      updatedAt: note.updatedAt,
    };
  }
}
