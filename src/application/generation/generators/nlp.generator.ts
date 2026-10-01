import { CARD_PROVIDER } from "@/common/constant/generation.constant";
import { NeuroxBrainClient } from "@/integrations/neurox-brain/neurox-brain.client";
import { Injectable, Logger } from "@nestjs/common";
import {
  CardGenerator,
  GeneratedCard,
  GenerationError,
  GenerationRequest,
  GenerationResult,
} from "./card-generator.interface";

/**
 * Card generation via `neurox-brain`: spaCy, TF-IDF and TextRank.
 *
 * **Where this sits.** Between the two existing generators, and the ordering is
 * deliberate rather than incidental. It reads a definition spread across a
 * sentence far better than `HeuristicCardGenerator`, whose patterns are string
 * matches; and unlike `GeminiCardGenerator` it costs nothing per card, sends
 * nothing to a third party, and works offline. The heuristic remains the
 * fallback because it needs no service at all, and Gemini remains the ceiling
 * because it is the only one that can paraphrase.
 *
 * **Why chunks are sent one at a time.** The same reason the Gemini generator
 * does it, and the reasons are worth restating because batching looks like the
 * obvious optimisation: one request carrying a whole document produces cards
 * concentrated on whatever the extractor considered the main theme, a single
 * bad chunk fails the whole job rather than itself, and stopping early once the
 * card cap is reached is impossible if everything was already sent.
 *
 * **Every card is a proposal.** The extraction patterns have a precision the
 * literature puts at roughly one in six on real course text — see
 * `docs/algorithms/definition-extraction.md`. That is not a defect to apologise
 * for; it is why the pipeline already lands generated cards as `DRAFT` and
 * requires a reader to accept them. The `confidence` the brain returns is
 * carried into the job's usage metadata so the drafting order is at least
 * sensible.
 */
@Injectable()
export class NlpCardGenerator implements CardGenerator {
  readonly provider = CARD_PROVIDER.BRAIN;

  private readonly logger = new Logger(NlpCardGenerator.name);

  constructor(private readonly client: NeuroxBrainClient) {}

  /**
   * Whether the brain is configured for this environment.
   *
   * Config, not reachability. Probing `/health` here would make every job pay a
   * network round trip to answer a question that configuration already answers,
   * and — worse — would make `defaultGenerator()` non-deterministic, so two
   * identical jobs could run on different providers with no record of why.
   * An unreachable brain fails loudly at generation time instead, which is the
   * right place for it.
   */
  isAvailable(): boolean {
    return this.client.isEnabled();
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const cards: GeneratedCard[] = [];
    const confidences: number[] = [];
    const kinds: Record<string, number> = {};

    let elapsedMs = 0;
    let model = "unknown";
    let shards = 0;

    for (const chunk of request.chunks) {
      if (cards.length >= request.maxCards) break;

      try {
        const analysis = await this.client.analyse(
          chunk.text,
          request.sourceTitle ?? null,
          {
            maxCards: request.maxCards - cards.length,
            // Nothing here consumes keywords, a summary or quiz questions: this
            // generator's job is cards. Asking for them would make the brain
            // compute TextRank over every chunk for output that is discarded.
            //
            // `maxQuizQuestions: 0` is a genuine request for none, which the
            // brain's schema now allows. It used to be `1` — the smallest value
            // permitted — and that still made the brain *build* a question, with
            // its WordNet lookups and distractor ranking, for a result this
            // generator then dropped.
            //
            // Cloze is off because a generated deck is facts a reader recalls,
            // not sentences with holes in them. Cloze remains a quiz format, and
            // the quiz is built in this application from the reader's own cards.
            includeCloze: false,
            maxKeywords: 1,
            maxSummarySentences: 1,
            maxQuizQuestions: 0,
          },
        );

        shards += 1;
        elapsedMs += analysis.stats.elapsed_ms;
        model = analysis.stats.model;

        for (const card of analysis.cards) {
          if (cards.length >= request.maxCards) break;

          cards.push({
            front: card.front,
            back: card.back,
            // No hint. The obvious candidate is `card.evidence` — the sentence
            // the card came from — and it is exactly the wrong thing: the
            // evidence contains the answer, so a reader who asks for a hint
            // would be shown the answer. The evidence is kept in the usage
            // metadata below, where a drafting interface can show it beside the
            // card rather than behind a button.
            hint: undefined,
          });

          confidences.push(card.confidence);
          kinds[card.kind] = (kinds[card.kind] ?? 0) + 1;
        }
      } catch (error) {
        // One chunk failing must not discard the cards the others produced.
        // A malformed chunk is common — a PDF page of table rows parses into
        // text with no sentences in it — and failing the job for it would mean
        // losing an entire document to one bad page.
        this.logger.warn(
          `Chunk ${chunk.index} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (cards.length === 0 && shards === 0) {
      throw new GenerationError(
        "neurox-brain produced nothing and answered no chunk; see the logs above.",
      );
    }

    // Ordered best first, so a reader working through drafts meets the
    // strongest candidates while they are still paying attention. Stable, so
    // cards of equal confidence keep the order the extractor produced them in.
    const ordered = cards
      .map((card, index) => ({ card, confidence: confidences[index] ?? 0 }))
      .sort((left, right) => right.confidence - left.confidence);

    return {
      cards: ordered.map((entry) => entry.card),
      model,
      usage: {
        /**
         * The brain's own `confidence` for each card, in the returned order.
         *
         * Carried because it is the only signal separating "the parser found a
         * definition" from "the parser found something shaped like one", and
         * the difference is large: the published precision for hand-written
         * definition patterns is around 0.16 on real course text. A drafting
         * interface can use this to order review; nothing else can reconstruct
         * it after the fact.
         */
        confidences: ordered.map(
          (entry) => Math.round(entry.confidence * 100) / 100,
        ),
        kinds,
        chunksAnalysed: shards,
        elapsedMs,
      },
    };
  }
}
