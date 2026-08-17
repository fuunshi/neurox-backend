/**
 * How well a card was recalled. Backed by the native Postgres enum
 * `review_rating`.
 *
 * Four steps rather than the five-to-six of the original SM-2 scale: the extra
 * grades are hard to tell apart in practice, and a reader who cannot decide
 * between "3" and "4" is being asked a question about the algorithm rather than
 * about the card.
 */
export const REVIEW_RATING = {
  /** Blanked, or wrong. The card comes back within the session. */
  AGAIN: "AGAIN",
  /** Recalled, but with effort. Advances slowly. */
  HARD: "HARD",
  /** Recalled correctly. The normal path. */
  GOOD: "GOOD",
  /** Immediate and effortless. Advances fastest. */
  EASY: "EASY",
} as const;

export type ReviewRating = (typeof REVIEW_RATING)[keyof typeof REVIEW_RATING];
