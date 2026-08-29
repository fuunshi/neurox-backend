import { describe, expect, it } from "vitest";
import {
  accuracyOf,
  averageSeconds,
  fillHours,
  fillWeekdays,
  rankLeeches,
  rankMissed,
  type LeechCandidate,
  type MissedCandidate,
} from "./analytics";

describe("fillWeekdays", () => {
  it("returns a full week even with no reviews", () => {
    const week = fillWeekdays([]);

    expect(week).toHaveLength(7);
    expect(week.every((day) => day.reviews === 0)).toBe(true);
    // The index is the weekday, so a chart can plot it without knowing which
    // days came back from the query.
    expect(week.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("places rows on their own weekday, leaving the others empty", () => {
    const week = fillWeekdays([
      { slot: 1, reviews: 4, correct: 3 },
      { slot: 6, reviews: 2, correct: 0 },
    ]);

    expect(week[1]).toEqual({ weekday: 1, reviews: 4, correct: 3 });
    expect(week[6]).toEqual({ weekday: 6, reviews: 2, correct: 0 });
    expect(week[3]).toEqual({ weekday: 3, reviews: 0, correct: 0 });
  });

  it("sums rows that land on the same slot rather than overwriting", () => {
    const week = fillWeekdays([
      { slot: 2, reviews: 3, correct: 3 },
      { slot: 2, reviews: 5, correct: 1 },
    ]);

    expect(week[2]).toEqual({ weekday: 2, reviews: 8, correct: 4 });
  });

  it("ignores a slot outside the week instead of growing the series", () => {
    // An eighth weekday cannot exist; a chart that silently acquired one would
    // be worse than one that ignored the row.
    const week = fillWeekdays([{ slot: 9, reviews: 1, correct: 1 }]);

    expect(week).toHaveLength(7);
    expect(week.reduce((sum, day) => sum + day.reviews, 0)).toBe(0);
  });
});

describe("fillHours", () => {
  it("returns all twenty-four hours, midnight first", () => {
    const day = fillHours([{ slot: 13, reviews: 9, correct: 7 }]);

    expect(day).toHaveLength(24);
    expect(day[0].hour).toBe(0);
    expect(day[13]).toEqual({ hour: 13, reviews: 9, correct: 7 });
    expect(day[23]).toEqual({ hour: 23, reviews: 0, correct: 0 });
  });
});

describe("accuracyOf", () => {
  it("is a fraction, not a percentage", () => {
    expect(accuracyOf(3, 4)).toBe(0.75);
  });

  it("is null rather than zero when nothing was asked", () => {
    // "You got none right" and "you have not tried" are different claims about
    // the reader, and an empty bar renders both the same way.
    expect(accuracyOf(0, 0)).toBeNull();
  });

  it("is null for a nonsense total rather than NaN", () => {
    expect(accuracyOf(1, Number.NaN)).toBeNull();
    expect(accuracyOf(1, -5)).toBeNull();
  });

  it("rounds to three places", () => {
    expect(accuracyOf(1, 3)).toBe(0.333);
  });
});

function leech(overrides: Partial<LeechCandidate> = {}): LeechCandidate {
  return {
    cardId: "card-1",
    front: "A card",
    deckId: "deck-1",
    deckTitle: "A deck",
    count: 1,
    lapses: 0,
    ...overrides,
  };
}

describe("rankLeeches", () => {
  it("puts the most-failed card first", () => {
    const ranked = rankLeeches([
      leech({ cardId: "a", front: "Rarely failed", count: 2 }),
      leech({ cardId: "b", front: "Often failed", count: 9 }),
    ]);

    expect(ranked.map((row) => row.cardId)).toEqual(["b", "a"]);
  });

  it("breaks a tie on the card's own lapse count", () => {
    // The window and the card's schedule are the same fact over different
    // histories, so a tie on the window is usually not a tie at all.
    const ranked = rankLeeches([
      leech({ cardId: "a", front: "Same", count: 4, lapses: 3 }),
      leech({ cardId: "b", front: "Same", count: 4, lapses: 11 }),
    ]);

    expect(ranked.map((row) => row.cardId)).toEqual(["b", "a"]);
  });

  it("breaks a full tie on the label, so the order is stable", () => {
    // A list that reorders itself between two loads of the same page reads as
    // a bug even when every number in it is right.
    const ranked = rankLeeches([
      leech({ cardId: "a", front: "Beta", count: 4, lapses: 2 }),
      leech({ cardId: "b", front: "Alpha", count: 4, lapses: 2 }),
    ]);

    expect(ranked.map((row) => row.cardId)).toEqual(["b", "a"]);
  });

  it("caps the list without touching the array it was given", () => {
    const rows = [
      leech({ cardId: "a", front: "A", count: 3 }),
      leech({ cardId: "b", front: "B", count: 2 }),
      leech({ cardId: "c", front: "C", count: 1 }),
    ];

    expect(rankLeeches(rows, 2).map((row) => row.cardId)).toEqual(["a", "b"]);
    expect(rows.map((row) => row.cardId)).toEqual(["a", "b", "c"]);
  });

  it("defaults to eight", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      leech({ cardId: `card-${index}`, front: `Card ${index}`, count: index }),
    );

    expect(rankLeeches(rows)).toHaveLength(8);
  });
});

function missed(overrides: Partial<MissedCandidate> = {}): MissedCandidate {
  return {
    cardId: "card-1",
    front: "A card",
    deckId: "deck-1",
    deckTitle: "A deck",
    count: 1,
    asked: 1,
    ...overrides,
  };
}

describe("rankMissed", () => {
  it("puts the most-missed card first", () => {
    const ranked = rankMissed([
      missed({ cardId: "a", front: "A", count: 1 }),
      missed({ cardId: "b", front: "B", count: 5 }),
    ]);

    expect(ranked.map((row) => row.cardId)).toEqual(["b", "a"]);
  });

  it("breaks a tie on how often it was asked", () => {
    const ranked = rankMissed([
      missed({ cardId: "a", front: "A", count: 3, asked: 3 }),
      missed({ cardId: "b", front: "B", count: 3, asked: 9 }),
    ]);

    expect(ranked.map((row) => row.cardId)).toEqual(["b", "a"]);
  });

  it("is stable on a full tie", () => {
    const ranked = rankMissed([
      missed({ cardId: "a", front: "Beta", count: 2, asked: 2 }),
      missed({ cardId: "b", front: "Alpha", count: 2, asked: 2 }),
    ]);

    expect(ranked.map((row) => row.cardId)).toEqual(["b", "a"]);
  });
});

describe("averageSeconds", () => {
  it("is null when nothing has finished", () => {
    expect(averageSeconds([])).toBeNull();
    expect(averageSeconds([null, null])).toBeNull();
  });

  it("means the durations it was given", () => {
    expect(averageSeconds([10, 20, 33])).toBe(21);
  });

  it("drops a negative duration rather than counting it as zero", () => {
    // A negative one means two clocks disagreed; folding it in as a zero would
    // quietly pull the average down.
    expect(averageSeconds([10, 20, -5])).toBe(15);
  });

  it("drops nulls and non-finite values", () => {
    expect(averageSeconds([null, Number.NaN, Infinity, 12, 16])).toBe(14);
  });
});
