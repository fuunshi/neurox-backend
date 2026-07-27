/** Backed by the native Postgres enum `source_type`. */
export const SOURCE_TYPE = {
  /** Pasted or typed prose. */
  TEXT: "TEXT",
  MARKDOWN: "MARKDOWN",
  TXT: "TXT",
  PDF: "PDF",
  DOCX: "DOCX",
} as const;

export type SourceType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];
