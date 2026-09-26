/** Backed by the native Postgres enum `content_status`. */
export const CONTENT_STATUS = {
  /** Written but not public. The only state a note is created in. */
  DRAFT: "DRAFT",
  /**
   * Public, once `published_at` has passed.
   *
   * Both conditions are required, which is what makes scheduling work without a
   * second state: a row can be `PUBLISHED` with a future `published_at` and it
   * is not public yet. See `content.service.ts` for the one predicate that
   * decides this, so no caller has to remember the pair.
   */
  PUBLISHED: "PUBLISHED",
  /** Withdrawn. Kept for the byline and for anything that links to it. */
  ARCHIVED: "ARCHIVED",
} as const;

export type ContentStatus =
  (typeof CONTENT_STATUS)[keyof typeof CONTENT_STATUS];
