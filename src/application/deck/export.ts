/**
 * Deck export, as a spreadsheet or as an Anki import.
 *
 * The escaping is the whole feature. Card text routinely contains the delimiter
 * (a comma in a definition), a quote, and newlines (a front or back written as
 * two paragraphs). A `join(",")` handles none of those and produces a file that
 * *looks* fine until it is opened, at which point the columns have shifted and
 * the rows no longer line up with the cards — silent corruption of exactly the
 * data someone is exporting because they care about it.
 */

export const EXPORT_FORMAT = {
  /** Comma-separated, for spreadsheets. */
  CSV: "csv",
  /**
   * Tab-separated, which is also what Anki's importer prefers — card text is far
   * more likely to contain a comma than a tab.
   */
  TSV: "tsv",
} as const;

export type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT];

export interface ExportCard {
  front: string;
  back: string;
  hint: string | null;
  status: string;
  dueAt: Date | null;
  intervalDays: number;
  lapses: number;
  createdAt: Date;
}

const COLUMNS = [
  "front",
  "back",
  "hint",
  "status",
  "due_at",
  "interval_days",
  "lapses",
  "created_at",
] as const;

/**
 * RFC 4180 quoting.
 *
 * A field is quoted when it contains the delimiter, a double quote, or a line
 * break, and any inner double quote is doubled. That is the whole rule, and
 * getting it wrong is invisible until the file is opened somewhere else.
 */
function escapeField(value: string, delimiter: string): string {
  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");

  if (!needsQuoting) return value;

  return `"${value.replace(/"/g, '""')}"`;
}

function cell(value: string | number | Date | null): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toDelimited(cards: ExportCard[], delimiter: string): string {
  const rows = [
    [...COLUMNS],
    ...cards.map((card) => [
      card.front,
      card.back,
      card.hint ?? "",
      card.status,
      card.dueAt,
      card.intervalDays,
      card.lapses,
      card.createdAt,
    ]),
  ];

  return (
    rows
      .map((row) =>
        row.map((value) => escapeField(cell(value), delimiter)).join(delimiter),
      )
      .join("\r\n") + "\r\n"
  );
}

export function delimiterFor(format: ExportFormat): string {
  return format === EXPORT_FORMAT.TSV ? "\t" : ",";
}

export function contentTypeFor(format: ExportFormat): string {
  return format === EXPORT_FORMAT.TSV
    ? "text/tab-separated-values; charset=utf-8"
    : "text/csv; charset=utf-8";
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === EXPORT_FORMAT.CSV || value === EXPORT_FORMAT.TSV;
}

/**
 * A filename that will not fight the filesystem.
 *
 * Deck titles are free text and can contain slashes, colons and emoji. Quoting
 * the header handles the encoding; stripping the rest handles the fact that
 * several filesystems simply refuse some of those characters.
 */
export function exportFilename(title: string, format: ExportFormat): string {
  const safe =
    title
      .replace(/[^\p{L}\p{N}\s._-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "deck";

  return `${safe}.${format}`;
}
