import { Injectable } from "@nestjs/common";

export interface TextChunk {
  /** Position within the source, starting at 0. */
  index: number;
  text: string;
}

export interface ChunkOptions {
  /** Soft upper bound per chunk. ~2000 chars is roughly 500 tokens. */
  maxChars?: number;
  /** Characters repeated from the previous chunk to avoid cutting mid-thought. */
  overlapChars?: number;
}

const DEFAULTS = { maxChars: 2000, overlapChars: 200 } as const;

/**
 * Splits extracted text into chunks for card generation.
 *
 * Chunking is deliberately boundary-aware. A naive fixed-width split cuts
 * sentences in half, and a model asked to make cards from half a sentence
 * produces half a card -- so splitting prefers paragraph breaks, then sentence
 * breaks, and only hard-splits a single sentence that exceeds the budget
 * (which happens with PDFs that lost their punctuation, or with CJK text).
 */
@Injectable()
export class ChunkingService {
  chunk(text: string, options: ChunkOptions = {}): TextChunk[] {
    const { maxChars, overlapChars } = { ...DEFAULTS, ...options };

    const normalised = this.normalise(text);
    if (normalised.length === 0) return [];

    const units = this.splitIntoUnits(normalised, maxChars);
    const chunks = this.packIntoChunks(units, maxChars);

    return chunks.map((chunkText, index) => ({
      index,
      text: this.applyOverlap(chunks, index, overlapChars),
    }));
  }

  private normalise(text: string): string {
    return text
      .replace(/\r\n?/g, "\n") // CRLF -> LF
      .replace(/[ \t]+/g, " ") // collapse runs of spaces
      .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
      .trim();
  }

  /**
   * Breaks text into paragraph-sized units, hard-splitting only when a single
   * paragraph is itself larger than a whole chunk.
   */
  private splitIntoUnits(text: string, maxChars: number): string[] {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const units: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxChars) {
        units.push(paragraph);
        continue;
      }

      for (const sentenceGroup of this.splitLongParagraph(
        paragraph,
        maxChars,
      )) {
        units.push(sentenceGroup);
      }
    }

    return units;
  }

  private splitLongParagraph(paragraph: string, maxChars: number): string[] {
    // Sentence boundary: terminator followed by whitespace. Keeps the
    // terminator with the sentence it ends.
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const out: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        // A single sentence too long to fit: flush, then hard-split it.
        if (current) {
          out.push(current);
          current = "";
        }
        for (let i = 0; i < sentence.length; i += maxChars) {
          out.push(sentence.slice(i, i + maxChars));
        }
        continue;
      }

      if (current.length + sentence.length + 1 > maxChars) {
        out.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }

    if (current) out.push(current);
    return out;
  }

  private packIntoChunks(units: string[], maxChars: number): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const unit of units) {
      const candidate = current ? `${current}\n\n${unit}` : unit;

      if (candidate.length > maxChars && current) {
        chunks.push(current);
        current = unit;
      } else {
        current = candidate;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Prefixes each chunk with the tail of the previous one, so a fact split
   * across a boundary is still visible to the model on both sides.
   */
  private applyOverlap(
    chunks: string[],
    index: number,
    overlapChars: number,
  ): string {
    if (index === 0 || overlapChars <= 0) return chunks[index];

    const previous = chunks[index - 1];
    const tail = previous.slice(-overlapChars).trimStart();

    return tail ? `${tail}\n\n${chunks[index]}` : chunks[index];
  }
}
