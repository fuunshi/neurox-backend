/**
 * Where a quiz attempt got to.
 *
 * Backed by the native Postgres enum `quiz_attempt_status`.
 *
 * There is no `ABANDONED`. A reader who closes the tab mid-quiz leaves an
 * `IN_PROGRESS` row, and that is accurate — they may come back to it, and a
 * status that guesses at intent would be a guess nothing can correct. Attempts
 * are scored from their answers, so an unfinished one is simply incomplete
 * rather than wrong.
 */
export const QUIZ_ATTEMPT_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export type QuizAttemptStatus =
  (typeof QUIZ_ATTEMPT_STATUS)[keyof typeof QUIZ_ATTEMPT_STATUS];
