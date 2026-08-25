/**
 * Quiz limits.
 *
 * Kept apart from `generation.constant.ts` because the two answer different
 * questions: that file is about drafting cards from a source, this one about
 * testing what a deck already holds. Sharing a constant file would invite
 * sharing a limit, and the right numbers have nothing to do with each other.
 */
export const QUIZ_DEFAULTS = {
  /** Questions in a quiz when the reader does not choose. */
  QUESTIONS: 10,
  /** A cap, not a target — matches the study session's own bound. */
  MAX_QUESTIONS: 50,
  /**
   * Options per question, including the correct one.
   *
   * Four because three makes guessing worthwhile and five is enough to make
   * eliminating feel like the work. Fewer are offered when a deck is too small
   * to supply them, which is why nothing here is enforced as a minimum.
   */
  OPTIONS_PER_QUESTION: 4,
} as const;
