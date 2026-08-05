/** Limits for source ingestion. */
export const SOURCE_LIMITS = {
  /** Maximum upload size. Larger documents should go through a queued job. */
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  /** Maximum pasted text length. */
  MAX_TEXT_CHARS: 500_000,
  /** Characters returned as an excerpt in list responses. */
  EXCERPT_CHARS: 500,
} as const;

/**
 * File extensions mapped to a source type. Extension rather than MIME type,
 * because browsers are inconsistent about the MIME type of .md and .txt and
 * routinely send `application/octet-stream`.
 */
export const SOURCE_EXTENSION_MAP = {
  ".txt": "TXT",
  ".text": "TXT",
  ".md": "MARKDOWN",
  ".markdown": "MARKDOWN",
  ".pdf": "PDF",
  ".docx": "DOCX",
} as const;
