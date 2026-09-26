/** Backed by the native Postgres enum `curriculum_kind`. */
export const CURRICULUM_KIND = {
  /** A programme of study — BCA, BSc CSIT, BIM. */
  COURSE: "COURSE",
  /** One of the eight semesters a TU course runs over. */
  SEMESTER: "SEMESTER",
  /**
   * A taught subject, e.g. Data Structures and Algorithms.
   *
   * A node belongs to exactly one branch of the tree, so the same subject
   * appears once per course that teaches it — BCA and BSc CSIT each get their
   * own node, under their own codes. That is deliberate for now: the notes
   * differ by syllabus even when the title matches. If the two ever need to
   * share one body of notes, that is a canonical-subject table added then, not
   * a column guessed at now.
   */
  SUBJECT: "SUBJECT",
  /** A unit within a subject's syllabus — the level notes are usually filed at. */
  UNIT: "UNIT",
} as const;

export type CurriculumKind =
  (typeof CURRICULUM_KIND)[keyof typeof CURRICULUM_KIND];
