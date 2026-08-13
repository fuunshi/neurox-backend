import { CARD_PROVIDER } from "@/common/constant/generation.constant";
import { GeminiClient } from "@/integrations/gemini/gemini.client";
import { Injectable, Logger } from "@nestjs/common";
import {
  CardGenerator,
  GeneratedCard,
  GenerationError,
  GenerationRequest,
  GenerationResult,
} from "./card-generator.interface";

/**
 * JSON schema handed to Gemini. `responseSchema` is enforced by the API, so the
 * reply is guaranteed to be an object with a `cards` array — no prompt-side
 * pleading, and no parsing of whatever prose the model felt like returning.
 *
 * Only `front` and `back` are required: a card without a hint is normal, and
 * requiring one would push the model to invent filler hints.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          hint: { type: "string" },
        },
        required: ["front", "back"],
      },
    },
  },
  required: ["cards"],
} as const;

interface GeminiCardsPayload {
  cards?: Array<{ front?: string; back?: string; hint?: string }>;
}

/**
 * Card generation via a hosted model.
 *
 * This is the implementation the heuristic one is a stand-in for: it can read a
 * definition spread across three sentences, paraphrase, and recognise a concept
 * that is explained rather than stated in the form "X is Y".
 *
 * Chunks are sent **one at a time** rather than concatenated. A single request
 * carrying a whole document would produce cards concentrated on whatever the
 * model considered the main theme, and would fail the whole job on one bad
 * chunk. Sequential also means the job can stop early once `maxCards` is
 * reached, so a large source does not pay for work it will discard.
 */
@Injectable()
export class GeminiCardGenerator implements CardGenerator {
  readonly provider = CARD_PROVIDER.GEMINI;

  private readonly logger = new Logger(GeminiCardGenerator.name);

  constructor(private readonly gemini: GeminiClient) {}

  isAvailable(): boolean {
    return this.gemini.isConfigured();
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (!this.isAvailable()) {
      throw new GenerationError("Gemini is not configured (no API key).");
    }

    const cards: GeneratedCard[] = [];
    const seen = new Set<string>();
    let usage: Record<string, unknown> | undefined;

    for (const chunk of request.chunks) {
      if (cards.length >= request.maxCards) break;

      const remaining = request.maxCards - cards.length;

      const result = await this.gemini.generateJson<GeminiCardsPayload>({
        prompt: this.buildPrompt({
          chunk: chunk.text,
          sourceTitle: request.sourceTitle,
          maxCards: remaining,
        }),
        responseSchema: RESPONSE_SCHEMA,
      });

      // Token counts accumulate across chunks, so the job records the cost of
      // the run rather than of its last request.
      if (result.usage) usage = mergeUsage(usage, result.usage);

      for (const raw of result.value.cards ?? []) {
        if (cards.length >= request.maxCards) break;

        const card = this.toCard(raw);
        if (!card) continue;

        // The same concept often appears in two overlapping chunks; the overlap
        // window guarantees it. Keep the first.
        const key = normalise(card.front);
        if (seen.has(key)) continue;

        seen.add(key);
        cards.push(card);
      }
    }

    return { cards, model: this.gemini.modelName, usage };
  }

  /**
   * The instruction is written to produce cards worth studying rather than cards
   * that merely restate a sentence: the failure mode of a language model here is
   * verbatim sentence-lifting, which makes a deck nobody can learn from.
   */
  private buildPrompt({
    chunk,
    sourceTitle,
    maxCards,
  }: {
    chunk: string;
    sourceTitle?: string;
    maxCards: number;
  }): string {
    return [
      "You write flashcards from study material.",
      "",
      sourceTitle ? `Source: ${sourceTitle}` : null,
      "",
      "Write at most",
      String(maxCards),
      "flashcards from the passage below.",
      "",
      "Rules:",
      "- Test understanding of one thing per card.",
      "- `front` is a question or a term; `back` answers it in one sentence.",
      "- Use the passage's own terminology, but paraphrase rather than lifting a",
      "  sentence verbatim — a card whose answer is already familiar teaches",
      "  nothing.",
      "- Skip administrative detail, page furniture, citations and anything that",
      "  is not worth remembering.",
      "- If the passage is too thin to make even one good card, return an empty",
      "  list. An empty list is a valid answer; a bad card is not.",
      "- Add a short `hint` only when the answer would otherwise be hard to",
      "  recall at all.",
      "",
      "Passage:",
      chunk,
    ]
      .filter((line) => line !== null)
      .join("\n");
  }

  /** Drops anything the schema allowed through but the product will not store. */
  private toCard(raw: {
    front?: string;
    back?: string;
    hint?: string;
  }): GeneratedCard | null {
    const front = raw.front?.trim();
    const back = raw.back?.trim();

    if (!front || !back) return null;

    return {
      front: front.slice(0, 5000),
      back: back.slice(0, 5000),
      hint: raw.hint?.trim() || undefined,
    };
  }
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sums the numeric fields of two usage reports, keeping the shape the provider
 *  used rather than inventing our own. */
function mergeUsage(
  into: Record<string, unknown> | undefined,
  from: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...into };

  for (const [key, value] of Object.entries(from)) {
    const existing = merged[key];
    merged[key] =
      typeof value === "number" && typeof existing === "number"
        ? existing + value
        : value;
  }

  return merged;
}
