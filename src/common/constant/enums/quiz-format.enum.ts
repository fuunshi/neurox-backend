/**
 * How a quiz question is presented.
 *
 * All three produce the same underlying question — a prompt, one correct
 * answer, and a set of options — and differ only in how that is laid out and
 * how many options are shared between questions. That is deliberate: grading,
 * scoring and history are one implementation, and a fourth format is a
 * generation rule plus a presenter rather than a new pipeline.
 *
 * Backed by the native Postgres enum `quiz_format`.
 */
export const QUIZ_FORMAT = {
  /**
   * One prompt, four options, exactly one right. Distractors are answers to
   * other cards in the same deck, so they are wrong for the question and
   * plausible in the subject.
   */
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  /**
   * A card's answer with one term removed. Tests the detail rather than the
   * gist, which a card's front and back already cover.
   */
  CLOZE: "CLOZE",
  /**
   * Prompts and answers drawn from one shared pool, matched up. The options for
   * every question are therefore the whole set, which is what makes it a
   * matching board rather than several multiple-choice questions side by side.
   */
  MATCHING: "MATCHING",
} as const;

export type QuizFormat = (typeof QUIZ_FORMAT)[keyof typeof QUIZ_FORMAT];
