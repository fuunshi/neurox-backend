import { GeminiClient } from "@/integrations/gemini/gemini.client";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

/**
 * Rewrites a card that is not working.
 *
 * The idea is narrow on purpose. A card forgotten five times is usually a badly
 * written card, not a difficult fact — the answer is buried, the question asks
 * two things at once, or it tests recognition where it means to test recall. A
 * reader can feel that but not always name it, so the thing worth doing is
 * proposing a concrete rewrite.
 *
 * **It never writes to the card.** The suggestion is returned for the reader to
 * accept or discard. That is the same stance the generator takes — material
 * arrives as a draft and a person decides — and it matters more here, because a
 * silent rewrite of something already being learned would change what the
 * schedule is measuring.
 */

/** What the model is asked to return. Enforced by the API, not by asking
 *  politely for JSON. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    front: { type: "string" },
    back: { type: "string" },
    hint: { type: "string" },
    reason: {
      type: "string",
      description: "One sentence on what was wrong with the original.",
    },
  },
  required: ["front", "back", "reason"],
} as const;

interface ImprovementPayload {
  front?: string;
  back?: string;
  hint?: string;
  reason?: string;
}

export interface CardImprovement {
  front: string;
  back: string;
  hint: string | null;
  reason: string;
  model: string;
}

@Injectable()
export class CardImproverService {
  private readonly logger = new Logger(CardImproverService.name);

  constructor(private readonly gemini: GeminiClient) {}

  isAvailable(): boolean {
    return this.gemini.isConfigured();
  }

  async improve(input: {
    front: string;
    back: string;
    hint?: string | null;
    lapses: number;
    sourceTitle?: string | null;
  }): Promise<CardImprovement> {
    if (!this.isAvailable()) {
      // Named plainly, because the fix is a piece of configuration and the
      // reader may be the person who can make it.
      throw new ServiceUnavailableException(
        "Improving cards needs the Gemini generator, which is not configured on this server. Set GEMINI_API_KEY to enable it.",
      );
    }

    const result = await this.gemini.generateJson<ImprovementPayload>({
      prompt: this.buildPrompt(input),
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      // Lower than generation: this is a rewrite of given text, not an act of
      // invention, and a wandering model produces a different card rather than a
      // better one.
      temperature: 0.3,
    });

    const front = result.value.front?.trim();
    const back = result.value.back?.trim();
    const reason = result.value.reason?.trim();

    if (!front || !back || !reason) {
      throw new Error("The model returned an unusable suggestion.");
    }

    this.logger.log(
      `Improved card (${input.lapses} lapses) via ${this.gemini.modelName}`,
    );

    return {
      front: front.slice(0, 5000),
      back: back.slice(0, 5000),
      hint: result.value.hint?.trim() || null,
      reason: reason.slice(0, 500),
      model: this.gemini.modelName,
    };
  }

  private buildPrompt(input: {
    front: string;
    back: string;
    hint?: string | null;
    lapses: number;
    sourceTitle?: string | null;
  }): string {
    return [
      "You improve flashcards that a learner keeps forgetting.",
      "",
      "Current card:",
      `  question: ${input.front}`,
      `  answer:   ${input.back}`,
      input.hint ? `  hint:     ${input.hint}` : null,
      "",
      `The learner has forgotten this card ${input.lapses} time${input.lapses === 1 ? "" : "s"}.`,
      input.sourceTitle ? `It came from: ${input.sourceTitle}` : null,
      "",
      "Rewrite it so it is easier to remember. The usual causes are worth",
      "checking in this order:",
      "  - the answer is long where a short one would do;",
      "  - the question asks two things at once;",
      "  - the question can be answered by recognising the wording rather than",
      "    by recalling the fact;",
      "  - the answer restates the question instead of answering it.",
      "",
      "Keep the same fact — this is a rewrite, not a new card, and the learner",
      "has already spent time on this one. Change as little as fixes it: if the",
      "card is already good, tighten the wording rather than replacing it.",
      "",
      "Return the rewritten question, answer, an optional short hint, and one",
      "sentence naming what was wrong with the original.",
    ]
      .filter((line) => line !== null)
      .join("\n");
  }
}
