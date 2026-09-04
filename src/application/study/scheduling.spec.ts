import { REVIEW_RATING } from "@/common/constant/enums/review-rating.enum";
import { describe, expect, it } from "vitest";
import {
  EASE,
  initialSchedulingState,
  isDue,
  MAX_INTERVAL_DAYS,
  RELEARN_MINUTES,
  schedule,
  type SchedulingState,
} from "./scheduling";

const NOW = new Date("2026-09-24T10:00:00.000Z");

const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));

/** Applies a sequence of grades, as a real session would. */
function review(
  grades: Array<(typeof REVIEW_RATING)[keyof typeof REVIEW_RATING]>,
  from: SchedulingState = initialSchedulingState(),
) {
  return grades.reduce((state, rating) => schedule(state, rating, NOW), from);
}

describe("a new card", () => {
  it("starts due immediately, with default ease", () => {
    const state = initialSchedulingState();

    expect(state.intervalDays).toBe(0);
    expect(state.easeFactor).toBe(EASE.DEFAULT);
    expect(state.repetitions).toBe(0);
    expect(state.lapses).toBe(0);
  });

  it("graduates to one day on GOOD", () => {
    const result = schedule(initialSchedulingState(), REVIEW_RATING.GOOD, NOW);

    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(daysBetween(NOW, result.dueAt)).toBe(1);
    // GOOD is the baseline: it does not move ease.
    expect(result.easeFactor).toBe(EASE.DEFAULT);
  });

  it("takes a shorter first step on AGAIN, in minutes not days", () => {
    const result = schedule(initialSchedulingState(), REVIEW_RATING.AGAIN, NOW);

    expect(result.intervalDays).toBe(0);
    expect(result.repetitions).toBe(0);
    expect(result.lapses).toBe(1);
    expect(result.easeFactor).toBe(EASE.DEFAULT - EASE.AGAIN_PENALTY);

    // Comes back within the session rather than tomorrow.
    const minutes = (result.dueAt.getTime() - NOW.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(RELEARN_MINUTES);
  });

  it("takes a longer first step on EASY", () => {
    const result = schedule(initialSchedulingState(), REVIEW_RATING.EASY, NOW);

    expect(result.intervalDays).toBe(2);
    expect(result.easeFactor).toBe(EASE.DEFAULT + EASE.EASY_BONUS);
  });

  it("still advances on HARD", () => {
    const result = schedule(initialSchedulingState(), REVIEW_RATING.HARD, NOW);

    // "Recalled with effort" is still recalled — a HARD that did not advance
    // would leave the reader stuck on a card they know.
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(EASE.DEFAULT - EASE.HARD_PENALTY);
  });
});

describe("intervals grow", () => {
  it("uses fixed first and second steps, then multiplies by ease", () => {
    const first = review([REVIEW_RATING.GOOD]);
    expect(first.intervalDays).toBe(1);

    const second = review([REVIEW_RATING.GOOD, REVIEW_RATING.GOOD]);
    expect(second.intervalDays).toBe(3);

    // Third onwards: 3 days × 2.5 ease = 7.5 → 8.
    const third = review([
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
    ]);
    expect(third.intervalDays).toBe(8);

    const fourth = review([
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
    ]);
    expect(fourth.intervalDays).toBe(Math.round(8 * 2.5));
  });

  it("gives fixed steps that are not zero, so a new card can escape", () => {
    // The bug this guards: multiplying an interval of 0 or 1 by ease leaves it
    // at 0 or 1 forever, so a card recalled perfectly never stops coming back.
    const afterThreeGood = review([
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
    ]);

    expect(afterThreeGood.intervalDays).toBeGreaterThan(3);
  });

  it("pushes EASY further than GOOD from the same point", () => {
    const base = review([REVIEW_RATING.GOOD, REVIEW_RATING.GOOD]);

    const good = schedule(base, REVIEW_RATING.GOOD, NOW);
    const easy = schedule(base, REVIEW_RATING.EASY, NOW);

    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
  });

  it("advances HARD less than GOOD from the same point", () => {
    const base = review([REVIEW_RATING.GOOD, REVIEW_RATING.GOOD]);

    const hard = schedule(base, REVIEW_RATING.HARD, NOW);
    const good = schedule(base, REVIEW_RATING.GOOD, NOW);

    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
    // And it always moves forward by at least a day.
    expect(hard.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe("ease", () => {
  it("falls on AGAIN and HARD, and rises on EASY", () => {
    const base = review([REVIEW_RATING.GOOD, REVIEW_RATING.GOOD]);

    expect(schedule(base, REVIEW_RATING.AGAIN, NOW).easeFactor).toBe(
      EASE.DEFAULT - EASE.AGAIN_PENALTY,
    );
    expect(schedule(base, REVIEW_RATING.HARD, NOW).easeFactor).toBe(
      EASE.DEFAULT - EASE.HARD_PENALTY,
    );
    expect(schedule(base, REVIEW_RATING.EASY, NOW).easeFactor).toBe(
      EASE.DEFAULT + EASE.EASY_BONUS,
    );
  });

  it("never falls below the floor, however often a card is forgotten", () => {
    let state: SchedulingState = initialSchedulingState();
    for (let i = 0; i < 50; i += 1) {
      state = schedule(state, REVIEW_RATING.AGAIN, NOW);
    }

    expect(state.easeFactor).toBe(EASE.MIN);
    // A card at the floor must still be reviewable, not stuck.
    expect(state.intervalDays).toBe(0);
  });

  it("never rises above the ceiling, however easy a card is", () => {
    let state: SchedulingState = initialSchedulingState();
    for (let i = 0; i < 50; i += 1) {
      state = schedule(state, REVIEW_RATING.EASY, NOW);
    }

    expect(state.easeFactor).toBe(EASE.MAX);
  });
});

describe("bounds", () => {
  it("caps the interval instead of running away", () => {
    // A card graded EASY for years would otherwise reach a date far past any
    // horizon. Start it already long.
    const long: SchedulingState = {
      intervalDays: MAX_INTERVAL_DAYS - 1,
      easeFactor: EASE.MAX,
      repetitions: 20,
      lapses: 0,
    };

    const result = schedule(long, REVIEW_RATING.EASY, NOW);

    expect(result.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
  });

  it("keeps an interval of at least a day once a card is advancing", () => {
    const odd: SchedulingState = {
      // Only reachable by hand-editing a row, but the scheduler must not divide
      // by it or produce a zero-day interval on a successful review.
      intervalDays: 0,
      easeFactor: EASE.MIN,
      repetitions: 5,
      lapses: 0,
    };

    expect(
      schedule(odd, REVIEW_RATING.GOOD, NOW).intervalDays,
    ).toBeGreaterThanOrEqual(1);
    expect(
      schedule(odd, REVIEW_RATING.HARD, NOW).intervalDays,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("forgetting and relearning", () => {
  it("resets the streak but keeps the lapse count", () => {
    const learned = review([
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
      REVIEW_RATING.GOOD,
    ]);
    const forgotten = schedule(learned, REVIEW_RATING.AGAIN, NOW);

    expect(forgotten.repetitions).toBe(0);
    expect(forgotten.lapses).toBe(1);
    expect(forgotten.intervalDays).toBe(0);
  });

  it("climbs back through the fixed steps after a lapse", () => {
    const lapsed = review([REVIEW_RATING.GOOD, REVIEW_RATING.AGAIN]);

    expect(schedule(lapsed, REVIEW_RATING.GOOD, NOW).intervalDays).toBe(1);
    expect(
      review([
        REVIEW_RATING.GOOD,
        REVIEW_RATING.AGAIN,
        REVIEW_RATING.GOOD,
        REVIEW_RATING.GOOD,
      ]).intervalDays,
    ).toBe(3);
  });

  it("records the interval that was in force, for the review log", () => {
    const learned = review([REVIEW_RATING.GOOD, REVIEW_RATING.GOOD]);
    const result = schedule(learned, REVIEW_RATING.AGAIN, NOW);

    expect(result.intervalBeforeDays).toBe(learned.intervalDays);
    expect(result.intervalDays).toBe(0);
  });
});

describe("determinism", () => {
  it("produces the same schedule for the same input", () => {
    const state = review([REVIEW_RATING.GOOD, REVIEW_RATING.HARD]);

    const a = schedule(state, REVIEW_RATING.GOOD, NOW);
    const b = schedule(state, REVIEW_RATING.GOOD, NOW);

    // A scheduling bug is invisible for weeks, so this is the cheapest possible
    // guard against a hidden dependency on the clock or on iteration order.
    expect(a).toEqual(b);
  });

  it("does not mutate the state it was given", () => {
    const state = initialSchedulingState();
    const snapshot = { ...state };

    schedule(state, REVIEW_RATING.EASY, NOW);

    expect(state).toEqual(snapshot);
  });
});

describe("isDue", () => {
  it("treats a never-reviewed card as due", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
  });

  it("treats a past due date as due and a future one as not", () => {
    expect(isDue(new Date(NOW.getTime() - 1000), NOW)).toBe(true);
    expect(isDue(new Date(NOW.getTime() + 1000), NOW)).toBe(false);
  });

  it("treats exactly now as due", () => {
    expect(isDue(new Date(NOW.getTime()), NOW)).toBe(true);
  });
});
