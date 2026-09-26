/**
 * Which backend produced a set of cards.
 *
 * Recorded per generation job rather than assumed globally, because the
 * intended path is LLM first and a locally trained model later -- and comparing
 * the two on the same source requires knowing which produced what.
 */
export const CARD_PROVIDER = {
  /** Deterministic, rule-based. No model, no network. */
  HEURISTIC: "heuristic",
  /** Hosted LLM provider. */
  GEMINI: "gemini",
  /**
   * The `neurox-brain` service: spaCy, TF-IDF and TextRank, running locally.
   *
   * Not an LLM and not a hosted API — it is a separate process we operate. It
   * sits between the other two deliberately: far better than the heuristic at
   * reading a definition spread across three sentences, and with no per-request
   * cost and no third-party dependency, unlike the hosted model.
   */
  BRAIN: "brain",
  /** A locally trained or self-hosted model. */
  LOCAL: "local",
} as const;

export type CardProvider = (typeof CARD_PROVIDER)[keyof typeof CARD_PROVIDER];

/** Default card generation limits. */
export const GENERATION_DEFAULTS = {
  /** Cap on cards produced per job. */
  MAX_CARDS: 50,
  /** Minimum characters a definition must have to become a card. */
  MIN_ANSWER_CHARS: 12,
  /**
   * Cap on chunks fed to a generator in one job.
   *
   * A pasted source may be 500,000 characters — roughly 250 chunks — and a
   * hosted model is called per chunk, so without a bound one job on one large
   * document becomes hundreds of requests and an unbounded bill. Thirty chunks
   * is comfortably more than the 50-card cap needs, since a single chunk
   * typically yields several cards.
   *
   * The chunks are taken from the start of the source; the job reports how
   * many cards it produced, so a source that was truncated is visible in the
   * result rather than silent.
   */
  MAX_CHUNKS: 30,
} as const;
