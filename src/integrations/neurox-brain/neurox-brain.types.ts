/**
 * The wire contract with `neurox-brain`.
 *
 * Hand-mirrored from that service's `schemas.py`, deliberately. Generating one
 * side from the other would mean a codegen step, a build dependency and a
 * version-skew failure mode, in exchange for keeping about eighty lines in
 * agreement. The two files name each other in their docblocks so that a change
 * to one is a change the other's author is pointed at.
 *
 * **Field names are snake_case, matching the wire exactly.** The brain service
 * serialises pydantic models, which are snake_case by default, and these types
 * deliberately do not rename anything on the way through: `elapsed_ms`,
 * `correct_index` and `job_id` are spelled here as they arrive. Renaming at the
 * boundary would mean this file no longer matches a real response, and the
 * usual consequence is a field that reads as `undefined` at runtime while
 * typechecking perfectly.
 *
 * The one place a rename *does* happen is the request, in
 * `neurox-brain.client.ts`: `BrainOptions` is camelCase because it is written
 * by TypeScript callers, and it is mapped to the service's snake_case body
 * there. That direction is safe because the mapping is exhaustive and local;
 * this direction is not, because responses are large and a missed field would
 * be silent.
 */

export type BrainCardKind = "DEFINITION" | "CLOZE" | "RELATION";
export type BrainQuizFormat = "MULTIPLE_CHOICE" | "CLOZE";

export interface BrainOptions {
  maxCards?: number;
  maxQuizQuestions?: number;
  includeCloze?: boolean;
  maxKeywords?: number;
  maxSummarySentences?: number;
}

export interface BrainCard {
  front: string;
  back: string;
  hint?: string | null;
  kind: BrainCardKind;
  confidence: number;
  /** The sentence this was extracted from, for the reader to judge it by. */
  evidence: string;
}

export interface BrainQuestion {
  format: BrainQuizFormat;
  prompt: string;
  options: string[];
  /** Must be stripped before a question reaches a reader. */
  correct_index: number;
  explanation?: string | null;
  evidence: string;
}

export interface BrainKeyword {
  term: string;
  score: number;
  count: number;
}

export interface BrainSummarySentence {
  text: string;
  score: number;
  index: number;
}

export interface BrainStats {
  sentences: number;
  tokens: number;
  chunks: number;
  elapsed_ms: number;
  model: string;
}

/** Everything `/analyse` returns. */
export interface BrainAnalysis {
  cards: BrainCard[];
  quiz: BrainQuestion[];
  keywords: BrainKeyword[];
  summary: BrainSummarySentence[];
  stats: BrainStats;
}

export interface BrainHealth {
  status: "ok" | "loading" | "degraded";
  model: string;
  model_loaded: boolean;
  version: string;
  uptime_seconds: number;
}

/**
 * A job sent over the queue, and the shape a webhook carries back.
 *
 * The queue is asynchronous, so the correlation has to survive the round trip:
 * `jobId` is what the API resolves the result against, and `correlationId` is
 * what the broker filters on so a consumer on a shared reply queue only picks
 * up its own messages.
 */
export interface BrainJobEnvelope {
  job_id: string;
  text: string;
  title?: string | null;
  options?: {
    max_cards?: number;
    max_quiz_questions?: number;
    include_cloze?: boolean;
    max_keywords?: number;
    max_summary_sentences?: number;
  };
  reply_to?: string | null;
  correlation_id?: string | null;
}

/** What comes back over the queue. */
export interface BrainJobResult {
  jobId: string;
  correlationId?: string | null;
  ok: boolean;
  error?: string | null;
  result: BrainAnalysis | null;
}

/** The error body the brain service returns, matching the Nest filter's shape. */
export interface BrainErrorBody {
  status: false;
  statusCode: number;
  message: string | string[];
  path: string;
}
