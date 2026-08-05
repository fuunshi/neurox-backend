import { SourceType } from "@/common/constant/enums";

export interface ExtractionInput {
  /** Raw uploaded bytes, or the UTF-8 encoding of pasted text. */
  buffer: Buffer;
  fileName?: string;
}

/**
 * Turns one input format into plain text.
 *
 * Pluggable by design: adding a format means adding an implementation and
 * registering it, not editing the service. The same shape will be used for the
 * card generators in phase 3.
 */
export interface TextExtractor {
  /** Source types this implementation handles. */
  readonly supports: readonly SourceType[];

  extract(input: ExtractionInput): Promise<string>;
}

export const TEXT_EXTRACTORS = Symbol("TEXT_EXTRACTORS");

/** Raised when input cannot be turned into text; surfaced as a 400. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}
