import { CONTENT_STATUS, CURRICULUM_KIND } from "@/common/constant/enums";
import { CurriculumNode, Note } from "@/database/entities";
import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { STARTER_NOTES, TU_BCA } from "./curriculum.data";

export interface CurriculumSeedReport {
  nodesCreated: number;
  nodesUpdated: number;
  nodesRestored: number;
  notesCreated: number;
}

interface NodeSeed {
  kind: (typeof CURRICULUM_KIND)[keyof typeof CURRICULUM_KIND];
  slug: string;
  title: string;
  code: string | null;
  path: string;
  depth: number;
  ordinal: number;
  parent: CurriculumNode | null;
  description: string | null;
}

/**
 * Puts the syllabus on the site, and is safe to run again.
 *
 * Upsert by `path` rather than insert, because this runs on every deploy and
 * the syllabus is edited in place — a re-run after a title fix has to correct
 * the title, not fail on a unique constraint.
 *
 * Three details worth knowing:
 *
 * - **A forked `EntityManager` throughout.** This runs outside a request, and
 *   MikroORM refuses writes through the global instance for exactly that
 *   reason. The fork is created once in `seed()` and passed down rather than
 *   held on the instance, so there is no half-initialised state if two seeds
 *   ever run at once.
 * - **Soft-deleted nodes are found and restored, not skipped.** `path` is
 *   unique across deleted rows too — deliberately, so a ranked URL is never
 *   silently inherited by different content — so looking only at live rows
 *   would make this try to insert a duplicate and die. Restoring is also the
 *   right answer: re-adding a semester that was removed means bringing it back.
 * - **Notes are created only if absent.** The starter note is a starting
 *   point, and the moment it is edited on the site it stops being the seeded
 *   version. Overwriting it would silently undo real work.
 */
@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(private readonly em: EntityManager) {}

  async seed(): Promise<CurriculumSeedReport> {
    const em = this.em.fork();

    const report: CurriculumSeedReport = {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesRestored: 0,
      notesCreated: 0,
    };

    const course = await this.upsertNode(em, report, {
      kind: CURRICULUM_KIND.COURSE,
      slug: TU_BCA.slug,
      title: TU_BCA.title,
      code: TU_BCA.code,
      path: TU_BCA.slug,
      depth: 0,
      ordinal: 0,
      parent: null,
      description: TU_BCA.description,
    });

    const bySlug = new Map<string, CurriculumNode>();

    for (const semester of TU_BCA.semesters) {
      const semesterPath = `${course.path}/semester-${semester.number}`;

      const semesterNode = await this.upsertNode(em, report, {
        kind: CURRICULUM_KIND.SEMESTER,
        slug: `semester-${semester.number}`,
        title: `Semester ${semester.number}`,
        code: null,
        path: semesterPath,
        depth: 1,
        ordinal: semester.number,
        parent: course,
        description: null,
      });

      for (const [index, subject] of semester.subjects.entries()) {
        const subjectNode = await this.upsertNode(em, report, {
          kind: CURRICULUM_KIND.SUBJECT,
          slug: subject.slug,
          title: subject.title,
          code: subject.code,
          path: `${semesterPath}/${subject.slug}`,
          depth: 2,
          ordinal: index,
          parent: semesterNode,
          description: null,
        });

        bySlug.set(subject.slug, subjectNode);
      }
    }

    await em.flush();

    report.notesCreated = await this.seedNotes(em, bySlug);
    await em.flush();

    this.logger.log(
      `Syllabus ready: ${report.nodesCreated} created, ${report.nodesUpdated} updated, ` +
        `${report.nodesRestored} restored, ${report.notesCreated} note(s) created`,
    );

    return report;
  }

  private async seedNotes(
    em: EntityManager,
    subjects: Map<string, CurriculumNode>,
  ): Promise<number> {
    let created = 0;

    for (const seed of STARTER_NOTES) {
      const node = subjects.get(seed.subject);

      if (!node) {
        this.logger.warn(
          `Skipping note "${seed.slug}": no subject "${seed.subject}" in the syllabus.`,
        );
        continue;
      }

      const existing = await em.findOne(
        Note,
        { slug: seed.slug },
        { filters: { softDelete: false } },
      );

      if (existing) continue;

      em.create(Note, {
        curriculumNode: node,
        slug: seed.slug,
        title: seed.title,
        excerpt: seed.excerpt,
        bodyMarkdown: seed.bodyMarkdown,
        status: CONTENT_STATUS.PUBLISHED,
        // Backdated, because `publishedAt <= now()` is half of what makes a
        // note public — a note stamped with the current instant could be
        // invisible to a request that began a millisecond earlier.
        publishedAt: new Date(Date.now() - 60_000),
        readingMinutes: seed.readingMinutes,
      });

      created += 1;
    }

    return created;
  }

  private async upsertNode(
    em: EntityManager,
    report: CurriculumSeedReport,
    data: NodeSeed,
  ): Promise<CurriculumNode> {
    const existing = await em.findOne(
      CurriculumNode,
      { path: data.path },
      { filters: { softDelete: false } },
    );

    if (!existing) {
      const node = em.create(CurriculumNode, data);
      report.nodesCreated += 1;
      return node;
    }

    if (existing.deletedAt) {
      existing.deletedAt = null;
      report.nodesRestored += 1;
    }

    // Only the fields the syllabus owns. `description` is left alone when the
    // seed has none, so an editor's own copy survives a redeploy.
    if (
      existing.title !== data.title ||
      existing.code !== data.code ||
      existing.ordinal !== data.ordinal
    ) {
      existing.title = data.title;
      existing.code = data.code;
      existing.ordinal = data.ordinal;
      report.nodesUpdated += 1;
    }

    if (data.description && existing.description !== data.description) {
      existing.description = data.description;
      report.nodesUpdated += 1;
    }

    return existing;
  }
}
