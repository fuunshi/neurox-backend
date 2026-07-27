/**
 * Lifecycle of a `Source`'s text extraction.
 *
 * Backed by the native Postgres enum `source_status`. A `Source` only becomes
 * `READY` once `rawText` is populated; generation refuses anything else.
 */
export const SOURCE_STATUS = {
  PENDING: "PENDING",
  EXTRACTING: "EXTRACTING",
  READY: "READY",
  FAILED: "FAILED",
} as const;

export type SourceStatus = (typeof SOURCE_STATUS)[keyof typeof SOURCE_STATUS];
