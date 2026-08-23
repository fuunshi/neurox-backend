import { describe, expect, it } from "vitest";
import {
  delimiterFor,
  exportFilename,
  isExportFormat,
  toDelimited,
  type ExportCard,
} from "./export";

/** Minimal RFC 4180 reader, so the tests verify the output by parsing it back
 *  rather than by comparing strings to strings this code produced. */
function parse(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

const card = (over: Partial<ExportCard> = {}): ExportCard => ({
  front: "What is spaced repetition?",
  back: "Reviewing at increasing intervals.",
  hint: null,
  status: "ACTIVE",
  dueAt: new Date("2026-09-25T08:00:00.000Z"),
  intervalDays: 3,
  lapses: 0,
  createdAt: new Date("2026-09-24T08:00:00.000Z"),
  ...over,
});

describe("toDelimited", () => {
  it("writes a header row naming every column", () => {
    const [header] = parse(toDelimited([], ","), ",");

    expect(header).toEqual([
      "front",
      "back",
      "hint",
      "status",
      "due_at",
      "interval_days",
      "lapses",
      "created_at",
    ]);
  });

  it("round-trips a card with a comma in the answer", () => {
    // The case that breaks a naive join: the comma would become a column
    // boundary and shift every field after it.
    const cards = [card({ back: "Reviewing often, then less often." })];
    const rows = parse(toDelimited(cards, ","), ",");

    expect(rows[1][1]).toBe("Reviewing often, then less often.");
    expect(rows[1]).toHaveLength(8);
  });

  it("round-trips quotes in the text", () => {
    const cards = [card({ front: 'What does "spaced" mean?' })];
    const rows = parse(toDelimited(cards, ","), ",");

    expect(rows[1][0]).toBe('What does "spaced" mean?');
  });

  it("round-trips newlines, which card backs genuinely contain", () => {
    const cards = [card({ back: "First line.\nSecond line." })];
    const rows = parse(toDelimited(cards, ","), ",");

    expect(rows[1][1]).toBe("First line.\nSecond line.");
    expect(rows).toHaveLength(2);
  });

  it("keeps rows aligned when only some cards need quoting", () => {
    const cards = [
      card({ front: "plain" }),
      card({ front: "has, a comma" }),
      card({ front: "also plain" }),
    ];
    const rows = parse(toDelimited(cards, ","), ",");

    expect(rows).toHaveLength(4);
    expect(rows.slice(1).every((r) => r.length === 8)).toBe(true);
    expect(rows[3][0]).toBe("also plain");
  });

  it("writes tabs with a tab delimiter", () => {
    const cards = [card({ back: "Reviewing often, then less often." })];
    const rows = parse(toDelimited(cards, "\t"), "\t");

    // The comma is safe unescaped in a TSV, which is the point of offering it.
    expect(rows[1][1]).toBe("Reviewing often, then less often.");
  });

  it("quotes a field containing the tab when tab-delimited", () => {
    const cards = [card({ front: "before\tafter" })];
    const rows = parse(toDelimited(cards, "\t"), "\t");

    expect(rows[1][0]).toBe("before\tafter");
  });

  it("writes an empty string for a missing hint, not the word null", () => {
    const rows = parse(toDelimited([card({ hint: null })], ","), ",");

    expect(rows[1][2]).toBe("");
  });

  it("writes a null due date as empty rather than as an epoch", () => {
    const rows = parse(toDelimited([card({ dueAt: null })], ","), ",");

    expect(rows[1][4]).toBe("");
  });

  it("writes dates as ISO so they sort and parse anywhere", () => {
    const rows = parse(toDelimited([card()], ","), ",");

    expect(rows[1][4]).toBe("2026-09-25T08:00:00.000Z");
  });

  it("ends with a line break, as a text file should", () => {
    expect(toDelimited([card()], ",").endsWith("\r\n")).toBe(true);
  });

  it("carries no cards other than the ones given", () => {
    const rows = parse(
      toDelimited([card(), card({ front: "second" })], ","),
      ",",
    );

    expect(rows).toHaveLength(3);
    expect(rows[2][0]).toBe("second");
  });
});

describe("delimiterFor and helpers", () => {
  it("picks the delimiter per format", () => {
    expect(delimiterFor("csv")).toBe(",");
    expect(delimiterFor("tsv")).toBe("\t");
  });

  it("recognises only the supported formats", () => {
    expect(isExportFormat("csv")).toBe(true);
    expect(isExportFormat("tsv")).toBe(true);
    expect(isExportFormat("xlsx")).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
  });
});

describe("exportFilename", () => {
  it("slugifies a title", () => {
    expect(exportFilename("Memory and retention", "csv")).toBe(
      "Memory-and-retention.csv",
    );
  });

  it("strips characters a filesystem may refuse", () => {
    const name = exportFilename("Deck/with:bad*chars?", "csv");

    expect(name).not.toMatch(/[/:*?\\]/);
    expect(name.endsWith(".csv")).toBe(true);
  });

  it("keeps non-latin letters rather than emptying the name", () => {
    expect(exportFilename("日本語のデッキ", "csv")).toBe("日本語のデッキ.csv");
  });

  it("falls back when a title leaves nothing usable", () => {
    expect(exportFilename("///", "csv")).toBe("deck.csv");
    expect(exportFilename("", "tsv")).toBe("deck.tsv");
  });
});
