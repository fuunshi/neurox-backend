import { describe, expect, it } from "vitest";
import { delimiterFor, toDelimited, type ExportCard } from "./export";
import {
  ImportError,
  MAX_IMPORT_ROWS,
  parseCards,
  parseDelimited,
  sniffDelimiter,
} from "./import";

/**
 * The round trip is the point, so most of these go through the exporter rather
 * than through a hand-written fixture: a fixture only proves this parser agrees
 * with the test author, while `toDelimited` proves it agrees with the writer.
 */

function exportCard(overrides: Partial<ExportCard> = {}): ExportCard {
  return {
    front: "to speak",
    back: "hablar",
    hint: null,
    status: "ACTIVE",
    dueAt: null,
    intervalDays: 0,
    lapses: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("parseDelimited", () => {
  it("keeps a delimiter inside quotes as content", () => {
    expect(parseDelimited('"a,b",c', ",")).toEqual([["a,b", "c"]]);
  });

  it("keeps a line break inside quotes as content", () => {
    expect(parseDelimited('"one\ntwo",x', ",")).toEqual([["one\ntwo", "x"]]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseDelimited('"say ""hi""",b', ",")).toEqual([['say "hi"', "b"]]);
  });

  it("treats CRLF as a single break", () => {
    expect(parseDelimited("a,b\r\nc,d", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops a trailing blank line", () => {
    expect(parseDelimited("a,b\r\n", ",")).toEqual([["a", "b"]]);
  });

  it("keeps an empty quoted field distinct from padding", () => {
    expect(parseDelimited('a,"",c', ",")).toEqual([["a", "", "c"]]);
  });
});

describe("sniffDelimiter", () => {
  it("prefers tabs when the header has any", () => {
    expect(sniffDelimiter("front\tback\nQ\tA")).toBe("\t");
  });

  it("falls back to a comma", () => {
    expect(sniffDelimiter("front,back\nQ,A")).toBe(",");
  });
});

describe("parseCards round trip", () => {
  it("restores what the exporter wrote, awkward characters included", () => {
    const original: ExportCard[] = [
      exportCard({
        front: 'Define "spaced repetition"',
        back: "Reviewing at increasing intervals, so recall\nis hard but possible",
        hint: "Not cramming",
        status: "ACTIVE",
        dueAt: new Date("2026-02-01T09:00:00.000Z"),
        intervalDays: 12,
        lapses: 2,
      }),
      exportCard({ front: "a, b, c", back: "commas, everywhere" }),
    ];

    for (const format of ["csv", "tsv"] as const) {
      const text = toDelimited(original, delimiterFor(format));
      const { cards, errors } = parseCards(text, format);

      expect(errors).toEqual([]);
      expect(cards).toHaveLength(2);

      expect(cards[0]).toMatchObject({
        front: 'Define "spaced repetition"',
        back: "Reviewing at increasing intervals, so recall\nis hard but possible",
        hint: "Not cramming",
        status: "ACTIVE",
        intervalDays: 12,
        lapses: 2,
      });
      expect(cards[0].dueAt?.toISOString()).toBe("2026-02-01T09:00:00.000Z");

      expect(cards[1]).toMatchObject({
        front: "a, b, c",
        back: "commas, everywhere",
        hint: null,
      });
    }
  });

  it("sniffs the delimiter when the caller does not know it", () => {
    const text = toDelimited([exportCard()], delimiterFor("tsv"));
    expect(parseCards(text).cards).toHaveLength(1);
  });

  it("reads columns by name, whatever order they are in", () => {
    const text = "back,front,lapses\nhablar,to speak,4\n";
    const { cards } = parseCards(text);

    expect(cards[0]).toMatchObject({
      front: "to speak",
      back: "hablar",
      lapses: 4,
    });
  });

  it("falls back to positional columns when there is no header", () => {
    const { cards } = parseCards("to speak,hablar\n");

    expect(cards[0]).toMatchObject({ front: "to speak", back: "hablar" });
  });

  it("does not mistake a card that reads 'front' for a header", () => {
    // Only one of the two names is present, so this is data.
    const { cards } = parseCards("front,hablar\n");
    expect(cards[0]).toMatchObject({ front: "front", back: "hablar" });
  });

  it("defaults a missing status to draft rather than guessing", () => {
    const { cards } = parseCards("Q,A\n");
    expect(cards[0].status).toBe("DRAFT");
  });

  it("leaves scheduling at zero when the columns are absent", () => {
    const { cards } = parseCards("Q,A\n");
    expect(cards[0]).toMatchObject({
      dueAt: null,
      intervalDays: 0,
      lapses: 0,
    });
  });
});

describe("parseCards reporting", () => {
  it("names the line of a row with no answer, and keeps the rest", () => {
    const text = "front,back\nQ one,A one\nQ two,\nQ three,A three\n";
    const { cards, errors } = parseCards(text);

    expect(cards).toHaveLength(2);
    expect(errors).toEqual(["Line 3: no answer."]);
  });

  it("counts lines from the body, not the file, when a header is present", () => {
    const text = "front,back\n,A\n";
    const { errors } = parseCards(text);
    expect(errors).toEqual(["Line 2: no question."]);
  });

  it("ignores blank padding rows in silence", () => {
    const text = "front,back\nQ,A\n,\n";
    const { cards, errors } = parseCards(text);

    expect(cards).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("rejects an unknown status rather than coercing it", () => {
    const text = "front,back,status\nQ,A,SOMETIME\n";
    const { cards, errors } = parseCards(text);

    expect(cards).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SOMETIME");
  });

  it("refuses a file larger than the row ceiling", () => {
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 2 },
      (_, i) => `Q${i},A${i}`,
    ).join("\n");

    expect(() => parseCards(rows)).toThrow(ImportError);
    expect(() => parseCards(rows)).toThrow(/limit is 2000/);
  });

  it("refuses a file with nothing usable in it", () => {
    expect(() => parseCards("")).toThrow(/no rows/i);
    expect(() => parseCards("front,back\n")).toThrow(/No cards could be read/i);
  });
});
