import {
  CARD_PROVIDER,
  GENERATION_DEFAULTS,
} from "@/common/constant/generation.constant";
import {
  CardGenerator,
  GeneratedCard,
  GenerationRequest,
  GenerationResult,
} from "./card-generator.interface";
import { Injectable } from "@nestjs/common";

/**
 * Rule-based card generation. No model, no network, fully deterministic.
 *
 * This exists so the whole pipeline -- job, queue, draft cards, review -- is
 * exercisable before any model is wired in, and so there is a baseline to
 * compare a real generator against. It is deliberately conservative: it would
 * rather produce four good cards than forty bad ones, because every card it
 * emits lands in a draft pile a human has to read.
 *
 * What it recognises:
 *   - `<Term> is/are/refers to/means <definition>`
 *   - `<Term>: <definition>`            (glossary and note style)
 *   - a markdown heading followed by a sentence, treated as term + definition
 *
 * What it does not do: infer, paraphrase, or handle a term defined across
 * several sentences. That is exactly the gap a real model fills.
 */
@Injectable()
export class HeuristicCardGenerator implements CardGenerator {
  readonly provider = CARD_PROVIDER.HEURISTIC;

  /**
   * Sentence-initial words that introduce a reference to something already
   * mentioned rather than naming a concept. Without this, "The process is
   * divided into four phases" becomes a card asking what "The process" is.
   */
  private static readonly NON_TERM_LEADERS = new Set([
    "the",
    "this",
    "that",
    "these",
    "those",
    "it",
    "there",
    "they",
    "he",
    "she",
    "we",
    "you",
    "i",
    "in",
    "on",
    "at",
    "for",
    "during",
    "each",
    "some",
    "many",
    "most",
    "both",
    "all",
    "when",
    "if",
    "as",
    "because",
    "however",
    "therefore",
    "then",
    "next",
    "finally",
    "its",
    "his",
    "her",
    "their",
    "our",
    "your",
    "such",
    "another",
    "other",
    "one",
    "two",
  ]);

  private static readonly DEFINITION =
    /^(?<term>[^:]{2,80}?)\s+(?<verb>is|are|was|were|refers to|means|describes)\s+(?<answer>.+)$/i;

  private static readonly COLON_DEFINITION =
    /^(?<term>[^:]{2,60}?)\s*:\s*(?<answer>.{12,})$/;

  isAvailable(): boolean {
    return true;
  }

  generate(request: GenerationRequest): Promise<GenerationResult> {
    const seen = new Set<string>();
    const cards: GeneratedCard[] = [];

    for (const chunk of request.chunks) {
      for (const card of this.cardsFromText(chunk.text)) {
        if (cards.length >= request.maxCards) break;

        // A term defined in several places should not become several cards.
        const key = this.normalise(card.front);
        if (seen.has(key)) continue;

        seen.add(key);
        cards.push(card);
      }

      if (cards.length >= request.maxCards) break;
    }

    return Promise.resolve({
      cards,
      // No model involved, so no model name and no usage to report. Recorded as
      // undefined rather than invented, so comparisons against a real provider
      // do not attribute made-up token counts to this one.
      usage: { chunksProcessed: request.chunks.length },
    });
  }

  private cardsFromText(text: string): GeneratedCard[] {
    const cards: GeneratedCard[] = [];

    for (const block of this.blocks(text)) {
      const card =
        this.fromHeading(block) ??
        this.fromColonDefinition(block) ??
        this.fromDefinition(block);

      if (card) cards.push(card);
    }

    return cards;
  }

  /**
   * Yields `{ heading, body }` pairs where a markdown heading is present, and
   * bare blocks otherwise, so heading-aware extraction can run first.
   */
  private blocks(text: string): { heading?: string; body: string }[] {
    const lines = text.split("\n");
    const out: { heading?: string; body: string }[] = [];

    let heading: string | undefined;
    let buffer: string[] = [];

    const flush = () => {
      const body = buffer.join("\n").trim();
      if (body || heading) out.push({ heading, body });
      buffer = [];
    };

    for (const line of lines) {
      const match = /^#{1,6}\s+(?<title>.+?)\s*$/.exec(line);

      if (match?.groups?.title) {
        flush();
        heading = match.groups.title;
        continue;
      }

      buffer.push(line);
    }

    flush();
    return out;
  }

  /** `## Mitosis` + the sentence after it. */
  private fromHeading(block: {
    heading?: string;
    body: string;
  }): GeneratedCard | null {
    if (!block.heading || !block.body) return null;

    const term = this.cleanTerm(block.heading);
    const answer = this.firstSentence(block.body);

    if (!term || !this.isUsableAnswer(answer)) return null;

    return { front: `What is ${term}?`, back: answer };
  }

  /** `Mitosis: the process by which a cell divides.` */
  private fromColonDefinition(block: { body: string }): GeneratedCard | null {
    for (const sentence of this.sentences(block.body)) {
      const match = HeuristicCardGenerator.COLON_DEFINITION.exec(sentence);
      const term = match?.groups?.term
        ? this.cleanTerm(match.groups.term)
        : null;
      const answer = match?.groups?.answer?.trim();

      if (term && answer && this.isUsableAnswer(answer)) {
        return { front: `What is ${term}?`, back: answer };
      }
    }

    return null;
  }

  /** `Mitosis is the process by which a single cell divides.` */
  private fromDefinition(block: { body: string }): GeneratedCard | null {
    for (const sentence of this.sentences(block.body)) {
      const match = HeuristicCardGenerator.DEFINITION.exec(sentence);
      if (!match?.groups) continue;

      const term = this.cleanTerm(match.groups.term);
      const answer = match.groups.answer.trim();
      const pluralVerb =
        match.groups.verb.toLowerCase() === "are" ||
        match.groups.verb.toLowerCase() === "were";

      if (!term || !this.isUsableAnswer(answer)) continue;

      return {
        front: pluralVerb ? `What are ${term}?` : `What is ${term}?`,
        back: answer,
      };
    }

    return null;
  }

  private sentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private firstSentence(text: string): string {
    return this.sentences(text)[0] ?? "";
  }

  /**
   * Rejects phrases that are references rather than names, and trims trailing
   * punctuation left by the surrounding sentence.
   */
  private cleanTerm(raw: string): string | null {
    const trimmed = raw
      .trim()
      .replace(/^[-*•]\s*/, "") // list bullets
      .replace(/[.,;:]+$/, "")
      .replace(/\s+/g, " ");

    if (trimmed.length < 2 || trimmed.length > 80) return null;

    const firstWord = trimmed.split(" ")[0]?.toLowerCase() ?? "";
    if (HeuristicCardGenerator.NON_TERM_LEADERS.has(firstWord)) return null;

    // A term should not read as a full clause.
    if (/\b(and|or|but)\b/i.test(trimmed) && trimmed.length > 40) return null;

    return trimmed;
  }

  private isUsableAnswer(answer: string): boolean {
    const trimmed = answer.trim();

    if (trimmed.length < GENERATION_DEFAULTS.MIN_ANSWER_CHARS) return false;

    // An answer that is itself just a pronoun is not an answer.
    if (/^(it|this|that|they|these|those)\b/i.test(trimmed)) return false;

    return true;
  }

  /** Keeps the source's own wording intact; used only for dedupe keys. */
  private normalise(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
}
