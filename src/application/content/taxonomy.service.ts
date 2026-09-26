import { CurriculumNode } from "@/database/entities";
import { Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { BreadcrumbDTO, CurriculumNodeDTO } from "./dto/content.dto";

/**
 * Reading the syllabus tree.
 *
 * Read-only, and deliberately so: in this milestone the taxonomy is seeded and
 * edited by hand, and the authoring surface that will write it arrives with the
 * rest of the publishing flow. Everything here is shaped for the public read
 * path, which means no caller identity anywhere and no per-reader filtering.
 */
@Injectable()
export class TaxonomyService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Every node, flat, shallowest first.
   *
   * The whole tree in one call is a deliberate choice rather than laziness: a
   * course is a few hundred nodes, every public page needs some slice of it,
   * and one cached response answers the sitemap, the breadcrumb, the course
   * listing and `generateStaticParams` without four round trips that can
   * disagree with each other.
   */
  async publicTree(): Promise<CurriculumNodeDTO[]> {
    const nodes = await this.em.find(
      CurriculumNode,
      {},
      { orderBy: { depth: "asc", ordinal: "asc", title: "asc" } },
    );

    return nodes.map((node) => this.toDTO(node));
  }

  /** One node by its full path, or a 404. */
  async findByPath(path: string): Promise<CurriculumNode> {
    const node = await this.em.findOne(CurriculumNode, { path });

    if (!node) {
      throw new NotFoundException("No such subject.");
    }

    return node;
  }

  /**
   * The trail from the root down to and including `path`.
   *
   * Built from the path itself rather than by walking `parent` pointers: every
   * ancestor's path is a prefix of the node's, so all of them are known before
   * the query runs and the whole trail is one indexed `IN` lookup.
   */
  async breadcrumbsFor(path: string): Promise<BreadcrumbDTO[]> {
    const prefixes = path
      .split("/")
      .map((_, index, all) => all.slice(0, index + 1).join("/"));

    const nodes = await this.em.find(
      CurriculumNode,
      { path: { $in: prefixes } },
      { orderBy: { depth: "asc" } },
    );

    return nodes.map((node) => ({ title: node.title, path: node.path }));
  }

  toDTO(node: CurriculumNode): CurriculumNodeDTO {
    return {
      id: node.id,
      parentPath: node.parent?.path ?? null,
      kind: node.kind,
      slug: node.slug,
      title: node.title,
      code: node.code ?? null,
      path: node.path,
      depth: node.depth,
      ordinal: node.ordinal,
      description: node.description ?? null,
      seoTitle: node.seoTitle ?? null,
      seoDescription: node.seoDescription ?? null,
      noindex: node.noindex,
      updatedAt: node.updatedAt,
    };
  }
}
