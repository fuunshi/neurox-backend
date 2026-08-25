import { Deck, GenerationJob, Source } from "@/database/entities";
import { EntityManager, type FilterQuery } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import {
  GRAPH_EDGE_TYPE,
  GRAPH_NODE_TYPE,
  KnowledgeGraphResponseDTO,
  type GraphEdgeDTO,
  type GraphNodeDTO,
} from "./dto/graph.dto";

/**
 * The reader's material, as a graph.
 *
 * ## What is real and what is not
 *
 * The **source and deck nodes are the reader's own**, and so are the edges
 * between them: `generation_job` already records which deck a set of cards was
 * drafted into from which source, so "this deck came out of that chapter" is a
 * fact the database has held since the first generation ran. Drawing it is
 * honest and needs nothing new.
 *
 * The **term layer is synthetic**, and the response says so via `placeholder`.
 * Real term nodes — what each deck is actually *about*, and which concepts two
 * decks share — is exactly the NLP work that is not built yet. Rather than
 * leave the graph shapeless until then, the terms here are derived from the
 * deck titles, which produces a graph of the right shape and no false
 * precision: a term is labelled with words the reader themselves typed.
 *
 * When the real thing lands, the sources and edges above do not change. Only
 * the term nodes and their weights do, which is the point of building it this
 * way round.
 */
@Injectable()
export class GraphService {
  constructor(private readonly em: EntityManager) {}

  async getGraph(userId: string): Promise<KnowledgeGraphResponseDTO> {
    const owned: FilterQuery<Deck> = { user: userId, deletedAt: null };

    const [decks, sources, jobs] = await Promise.all([
      this.em.find(Deck, owned, {
        orderBy: { createdAt: "asc" },
        limit: 12,
      }),
      this.em.find(
        Source,
        { user: userId, deletedAt: null },
        { orderBy: { createdAt: "asc" }, limit: 12 },
      ),
      this.em.find(
        GenerationJob,
        { user: userId, deletedAt: null },
        {
          orderBy: { createdAt: "asc" },
          limit: 50,
          // Populated because the edge is built from both ends: without this,
          // `job.source` is an uninitialised reference and reading `.id` off it
          // is exactly the kind of thing that works in one driver and not the
          // next.
          populate: ["source", "deck"],
        },
      ),
    ]);

    const nodes: GraphNodeDTO[] = [];
    const edges: GraphEdgeDTO[] = [];

    for (const deck of decks) {
      nodes.push({
        id: `deck:${deck.id}`,
        type: GRAPH_NODE_TYPE.DECK,
        label: deck.title,
        weight: 0.7,
      });
    }

    for (const source of sources) {
      nodes.push({
        id: `source:${source.id}`,
        type: GRAPH_NODE_TYPE.SOURCE,
        label: source.title,
        weight: source.status === "READY" ? 0.6 : 0.3,
      });
    }

    // Real provenance: a job that produced cards is a relationship between a
    // source and a deck, and it already exists in the table.
    const seen = new Set<string>();

    for (const job of jobs) {
      if (job.status !== "SUCCEEDED" || job.cardsCreated <= 0) continue;

      const source = job.source?.id;
      const deck = job.deck?.id;
      if (!source || !deck) continue;

      const key = `${source}->${deck}`;
      if (seen.has(key)) continue;
      seen.add(key);

      edges.push({
        source: `source:${source}`,
        target: `deck:${deck}`,
        type: GRAPH_EDGE_TYPE.GENERATED_FROM,
        weight: 0.8,
      });
    }

    // The synthetic layer. One term node per deck, labelled with the deck's own
    // wording, so nothing here claims to know something the reader did not say.
    for (const deck of decks) {
      const term = topTermOf(deck.title);
      if (!term) continue;

      nodes.push({
        id: `term:${deck.id}`,
        type: GRAPH_NODE_TYPE.TERM,
        label: term,
        weight: 0.5,
      });

      edges.push({
        source: `deck:${deck.id}`,
        target: `term:${deck.id}`,
        type: GRAPH_EDGE_TYPE.COVERS,
        weight: 0.5,
      });
    }

    return { nodes, edges, placeholder: true };
  }
}

/**
 * A stand-in for a term, taken from a deck's own title.
 *
 * Deliberately not a keyword extractor: anything that looked like real term
 * extraction would be believed, and this is a placeholder. Taking the longest
 * word is obviously mechanical, which is the honest signal.
 */
function topTermOf(title: string): string | null {
  const words = title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 3);

  if (words.length === 0) return null;

  return words.reduce((longest, word) =>
    word.length > longest.length ? word : longest,
  );
}
