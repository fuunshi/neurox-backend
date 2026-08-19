import { describe, expect, it } from "vitest";
import {
  computeStreak,
  fillDays,
  retentionRate,
  type ReviewDay,
} from "./stats";

describe("computeStreak", () => {
  it("is zero with no history", () => {
    expect(computeStreak([], "2026-09-24")).toEqual({ current: 0, longest: 0 });
  });

  it("counts consecutive days ending today", () => {
    const streak = computeStreak(
      ["2026-09-22", "2026-09-23", "2026-09-24"],
      "2026-09-24",
    );

    expect(streak.current).toBe(3);
  });

  it("still counts a run that ended yesterday", () => {
    // At 9am, before studying, a streak that had already reset would be lying
    // about the day the reader is still in the middle of.
    const streak = computeStreak(
      ["2026-09-22", "2026-09-23"],
      "2026-09-24",
    );

    expect(streak.current).toBe(2);
  });

  it("breaks a run that ended two days ago", () => {
    const streak = computeStreak(
      ["2026-09-20", "2026-09-21"],
      "2026-09-24",
    );

    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(2);
  });

  it("reports the longest run even when the current one is short", () => {
    const streak = computeStreak(
      [
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        // gap
        "2026-09-24",
      ],
      "2026-09-24",
    );

    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(4);
  });

  it("ignores duplicates and unsorted input", () => {
    const streak = computeStreak(
      ["2026-09-24", "2026-09-23", "2026-09-23", "2026-09-24"],
      "2026-09-24",
    );

    expect(streak.current).toBe(2);
  });

  it("crosses a month boundary", () => {
    const streak = computeStreak(
      ["2026-08-30", "2026-08-31", "2026-09-01"],
      "2026-09-01",
    );

    expect(streak.current).toBe(3);
  });
});

describe("retentionRate", () => {
  it("is null with nothing to divide by, not zero", () => {
    // Zero would read as "you remember nothing", which is a different and much
    // worse claim than "there is no data yet".
    expect(retentionRate([])).toBeNull();
    expect(retentionRate([{ day: "2026-09-24", reviews: 0, correct: 0 }])).toBeNull();
  });

  it("is the share of reviews that were not AGAIN", () => {
    expect(
      retentionRate([{ day: "2026-09-24", reviews: 10, correct: 8 }]),
    ).toBeCloseTo(0.8);
  });

  it("sums across days", () => {
    expect(
      retentionRate([
        { day: "2026-09-23", reviews: 4, correct: 4 },
        { day: "2026-09-24", reviews: 6, correct: 3 },
      ]),
    ).toBeCloseTo(0.7);
  });
});

describe("fillDays", () => {
  it("inserts the days with no reviews", () => {
    const filled = fillDays(
      [{ day: "2026-09-22", reviews: 5, correct: 4 }],
      { from: "2026-09-21", to: "2026-09-24" },
    );

    expect(filled.map((d) => d.day)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(filled[1].reviews).toBe(5);
    expect(filled[2]).toEqual({ day: "2026-09-23", reviews: 0, correct: 0 });
  });

  it("does not loop forever on an inverted range", () => {
    expect(fillDays([], { from: "2026-09-24", to: "2026-09-01" })).toEqual([]);
  });
});
