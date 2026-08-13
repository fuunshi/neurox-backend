import { CardProvider } from "@/common/constant/generation.constant";
import { TextChunk } from "@/application/source/chunking.service";

export interface GeneratedCard {
  front: string;
  back: string;
  hint?: string;
}

export interface GenerationRequest {
  chunks: TextChunk[];
  /** Upper bound the generator must respect. */
  maxCards: number;
  /** Context only; a generator may use it to phrase questions better. */
  sourceTitle?: string;
}

export interface GenerationResult {
  cards: GeneratedCard[];
  /** Specific model, e.g. `gemini-2.5-pro`. Null for non-model generators. */
  model?: string;
  /** Free-form usage/cost metadata, recorded for later comparison. */
  usage?: Record<string, unknown>;
}

/**
 * Turns text into draft cards.
 *
 * The whole point of this interface is that the backend is expected to change:
 * a heuristic today, a hosted LLM next, a locally trained model after that.
 * Nothing above this layer knows which is in use -- the active implementation
 * is chosen by config and recorded on the job that produced the cards.
 */
export interface CardGenerator {
  readonly provider: CardProvider;

  /** Returns false when the implementation is not usable in this environment. */
  isAvailable(): boolean;

  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export const CARD_GENERATORS = Symbol("CARD_GENERATORS");

/** Raised when generation cannot proceed; surfaced on the job as `error`. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
