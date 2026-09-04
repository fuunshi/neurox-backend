/**
 * Deck import: the inverse of `export.ts`.
 *
 * The parsing is the whole feature, for the same reason the escaping is on the
 * way out. A card's front or back routinely contains the delimiter, a quote and
 * a line break, so splitting on newlines and then on commas produces a file
 * that reads correctly for every simple row and silently misaligns every row
 * after the first hard one — with the columns shifted, the damage is invisible
 * until someone studies the wrong answer.
 *
 * So this is a real RFC 4180 reader: quotes suspend the delimiter and the line
 * break, and a doubled quote inside a quoted field is one literal quote. It is
 * deliberately a small state machine rather than a regex, because a regex over
 * this grammar is where the off-by-one lives.
 */

import { CARD_STATUS, type CardStatus } from "@/common/constant";

/** The columns `export.ts` writes. Reading by name is what makes a round trip
 *  survive a reader reordering or dropping columns in a spreadsheet. */
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

type Column = (typeof COLUMNS)[number];

/**
 * A ceiling on how much one import may create.
 *
 * Refused rather than truncated: an import that quietly stopped halfway would
 * leave someone believing a deck was complete, which is the same failure the
 * export refuses to have.
 */
export const MAX_IMPORT_ROWS = 2000;

/** And a ceiling on the document itself, so the row limit above is not the only
 *  thing standing between a request body and memory. The web app refuses the
 *  same size client-side; this is the copy that actually holds. */
export const MAX_IMPORT_CHARS = 2_000_000;

export interface ImportedCard {
  front: string;
  back: string;
  hint: string | null;
  status: CardStatus;
  dueAt: Date | null;
  intervalDays: number;
  lapses: number;
}

export interface ImportParseResult {
  cards: ImportedCard[];
  /** Rows that could not be read, one message each, naming the line. */
  errors: string[];
}

export class ImportError extends Error {}

/**
 * Reads a delimited document into rows of raw fields.
 *
 * Quoted fields may contain the delimiter, `\r\n` or `\n`, and `""` is a
 * literal quote. A quote appearing mid-field is treated as an ordinary
 * character, which is what every spreadsheet does in practice.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      started = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      started = true;
      continue;
    }

    if (char === "\r") {
      // Swallow `\r\n` as one break; a lone `\r` is an old-Mac break.
      if (text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
      continue;
    }

    field += char;
    started = true;
  }

  if (started || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Trailing blank line, which every writer leaves behind.
  return rows.filter(
    (candidate) => candidate.length > 1 || candidate[0]?.trim() !== "",
  );
}

/**
 * Picks the delimiter from the first line, tab before comma.
 *
 * Tab wins a tie because the export's own TSV exists precisely because card
 * text contains commas: a comma-separated guess on a tab-separated file with
 * commas in the questions produces one field per row rather than an error.
 */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > 0 && tabs >= commas ? "\t" : ",";
}

/** Maps a header row to columns, or null when it is not a header. */
function headerIndex(row: string[]): Map<Column, number> | null {
  const normalised = row.map((cell) => cell.trim().toLowerCase());
  const hasFront = normalised.includes("front");
  const hasBack = normalised.includes("back");

  // Both names must be present: a card whose front is literally "front" is far
  // less likely than a header, but a single match is not enough to commit.
  if (!hasFront || !hasBack) return null;

  const index = new Map<Column, number>();
  for (const column of COLUMNS) {
    const at = normalised.indexOf(column);
    if (at !== -1) index.set(column, at);
  }
  return index;
}

function cellAt(
  row: string[],
  index: Map<Column, number> | null,
  column: Column,
  positional: number,
): string {
  const at = index ? index.get(column) : positional;
  if (at === undefined) return "";
  return (row[at] ?? "").trim();
}

function parseStatus(raw: string): CardStatus | null {
  const value = raw.trim().toUpperCase();
  if (value === "") return CARD_STATUS.DRAFT;
  return (Object.values(CARD_STATUS) as string[]).includes(value)
    ? (value as CardStatus)
    : null;
}

function parseCount(raw: string): number {
  if (raw.trim() === "") return 0;
  const value = Number(raw.trim());
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function parseDate(raw: string): Date | null {
  if (raw.trim() === "") return null;
  const value = new Date(raw.trim());
  return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Parses a deck file into cards, reporting the rows it could not use.
 *
 * Unusable rows are named rather than counted, and do not fail the import: a
 * spreadsheet with a blank line at the end is normal, and refusing the whole
 * file over it would be worse than importing the rest and saying so.
 */
export function parseCards(
  content: string,
  format?: "csv" | "tsv",
): ImportParseResult {
  const delimiter =
    format === "tsv" ? "\t" : format === "csv" ? "," : sniffDelimiter(content);
  const rows = parseDelimited(content, delimiter);

  if (rows.length === 0) {
    throw new ImportError("That file has no rows in it.");
  }

  if (rows.length > MAX_IMPORT_ROWS + 1) {
    throw new ImportError(
      `That file has ${rows.length} rows. The limit is ${MAX_IMPORT_ROWS} — split it and import the parts.`,
    );
  }

  const header = headerIndex(rows[0]);
  const body = header ? rows.slice(1) : rows;
  /** Header line numbers are one ahead of the body's. */
  const lineOffset = header ? 2 : 1;

  const cards: ImportedCard[] = [];
  const errors: string[] = [];

  body.forEach((row, position) => {
    const line = position + lineOffset;

    const front = cellAt(row, header, "front", 0);
    const back = cellAt(row, header, "back", 1);

    if (front === "" && back === "") {
      // A truly empty row is padding, not a mistake. Skipped in silence.
      return;
    }

    if (front === "") {
      errors.push(`Line ${line}: no question.`);
      return;
    }

    if (back === "") {
      errors.push(`Line ${line}: no answer.`);
      return;
    }

    const status = parseStatus(cellAt(row, header, "status", 3));
    if (status === null) {
      errors.push(
        `Line ${line}: "${cellAt(row, header, "status", 3)}" is not a card status.`,
      );
      return;
    }

    const hint = cellAt(row, header, "hint", 2);

    cards.push({
      front,
      back,
      hint: hint === "" ? null : hint,
      status,
      dueAt: parseDate(cellAt(row, header, "due_at", 4)),
      intervalDays: parseCount(cellAt(row, header, "interval_days", 5)),
      lapses: parseCount(cellAt(row, header, "lapses", 6)),
    });
  });

  if (cards.length === 0 && errors.length === 0) {
    throw new ImportError(
      "No cards could be read from that file. The first two columns should be the question and the answer.",
    );
  }

  return { cards, errors };
}
