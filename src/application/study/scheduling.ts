import type { ReviewRating } from "@/common/constant/enums/review-rating.enum";
import { REVIEW_RATING } from "@/common/constant/enums/review-rating.enum";

/**
 * Spaced-repetition scheduling, in one pure function.
 *
 * A simplified SM-2: the same shape as the original — an interval multiplied by
 * an ease factor that moves with performance — with four grades instead of six
 * and no per-card quality history. It is deliberately not a faithful SM-2
 * implementation, because the parts left out (the full ease-arithmetic table,
 * the 1.3 floor reached by discrete steps) exist to serve a five-point scale
 * nobody grades consistently.
 *
 * Being a pure function of (state, rating, now) is the point: it can be tested
 * exhaustively without a database, and reviewing the same card with the same
 * grade twice produces the same schedule.
 */

/**
 * Ease is stored and computed **×100** — see `FlashCard.easeFactor`. Everything
 * here is integer arithmetic; the only rounding is on the interval, where it is
 * unavoidable and harmless.
 */
export const EASE = {
  /** Where a card starts. 2.5 in the original. */
  DEFAULT: 250,
  /** The floor. Below this, intervals grow so slowly the card never leaves. */
  MIN: 130,
  /** A ceiling, so an easy card cannot run away to absurd intervals. */
  MAX: 280,
  HARD_PENALTY: 15,
  AGAIN_PENALTY: 20,
  EASY_BONUS: 15,
} as const;

/** A forgotten card returns within the session rather than tomorrow. */
export const RELEARN_MINUTES = 10;

/** Ten years. A cap, not a target: it stops an easy card reaching a due date
 *  past any reasonable horizon. */
export const MAX_INTERVAL_DAYS = 3650;

/** The first two successful intervals, before ease starts multiplying. */
const GRADUATING_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 3;

/** Easier first steps, because the reader has said the card was effortless. */
const EASY_FIRST_INTERVAL_DAYS = 2;
const EASY_SECOND_INTERVAL_DAYS = 5;

/** How much further EASY pushes once intervals are growing. */
const EASY_MULTIPLIER = 130; // ×100, so 1.3

export interface SchedulingState {
  intervalDays: number;
  /** ×100. */
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

export interface ScheduledState extends SchedulingState {
  /** When the card next comes up. */
  dueAt: Date;
  /** The interval that was in force before, for the review log. */
  intervalBeforeDays: number;
}

/** A card that has never been reviewed. */
export function initialSchedulingState(): SchedulingState {
  return {
    intervalDays: 0,
    easeFactor: EASE.DEFAULT,
    repetitions: 0,
    lapses: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function minutesFrom(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

/**
 * Applies one review.
 *
 * `now` is a parameter rather than read from the clock so this is deterministic
 * and testable — the one place a scheduling bug is invisible until weeks later,
 * when cards stop coming back.
 *
 * AGAIN is the only grade that resets `repetitions` and the only one that
 * returns the card to the same session. The others always move forward, which is
 * what keeps a card from being stuck in a loop of short intervals.
 */
export function schedule(
  state: SchedulingState,
  rating: ReviewRating,
  now: Date = new Date(),
): ScheduledState {
  const intervalBeforeDays = state.intervalDays;

  switch (rating) {
    case REVIEW_RATING.AGAIN: {
      return {
        intervalDays: 0,
        easeFactor: clamp(
          state.easeFactor - EASE.AGAIN_PENALTY,
          EASE.MIN,
          EASE.MAX,
        ),
        repetitions: 0,
        lapses: state.lapses + 1,
        dueAt: minutesFrom(now, RELEARN_MINUTES),
        intervalBeforeDays,
      };
    }

    case REVIEW_RATING.HARD: {
      const repetitions = state.repetitions + 1;
      const easeFactor = clamp(
        state.easeFactor - EASE.HARD_PENALTY,
        EASE.MIN,
        EASE.MAX,
      );

      // Recalled, but with effort: it advances, yet never by the ease factor.
      const intervalDays =
        repetitions === 1
          ? GRADUATING_INTERVAL_DAYS
          : clamp(
              Math.round(state.intervalDays * 1.2) || GRADUATING_INTERVAL_DAYS,
              1,
              MAX_INTERVAL_DAYS,
            );

      return {
        intervalDays,
        easeFactor,
        repetitions,
        lapses: state.lapses,
        dueAt: daysFrom(now, intervalDays),
        intervalBeforeDays,
      };
    }

    case REVIEW_RATING.EASY: {
      const repetitions = state.repetitions + 1;
      const easeFactor = clamp(
        state.easeFactor + EASE.EASY_BONUS,
        EASE.MIN,
        EASE.MAX,
      );

      const intervalDays = nextInterval(state.intervalDays, repetitions, {
        first: EASY_FIRST_INTERVAL_DAYS,
        second: EASY_SECOND_INTERVAL_DAYS,
        multiplier: (easeFactor * EASY_MULTIPLIER) / 100,
      });

      return {
        intervalDays,
        easeFactor,
        repetitions,
        lapses: state.lapses,
        dueAt: daysFrom(now, intervalDays),
        intervalBeforeDays,
      };
    }

    case REVIEW_RATING.GOOD:
    default: {
      const repetitions = state.repetitions + 1;

      const intervalDays = nextInterval(state.intervalDays, repetitions, {
        first: GRADUATING_INTERVAL_DAYS,
        second: SECOND_INTERVAL_DAYS,
        multiplier: state.easeFactor / 100,
      });

      return {
        intervalDays,
        // Unchanged: GOOD is the baseline the others move away from.
        easeFactor: state.easeFactor,
        repetitions,
        lapses: state.lapses,
        dueAt: daysFrom(now, intervalDays),
        intervalBeforeDays,
      };
    }
  }
}

/**
 * The first two successful reviews use fixed steps, then ease takes over.
 *
 * Fixed steps exist because multiplying a zero or one-day interval by ease
 * gives a zero or one-day interval — a new card would never escape the first day
 * no matter how often it was recalled correctly.
 */
function nextInterval(
  currentIntervalDays: number,
  repetitions: number,
  options: { first: number; second: number; multiplier: number },
): number {
  if (repetitions <= 1) return options.first;
  if (repetitions === 2) return options.second;

  const grown = Math.round(currentIntervalDays * options.multiplier);

  // `max(1, …)` guards the pathological case: a card whose interval is 0 but
  // whose repetitions are high, which only a hand-edited row can produce.
  return clamp(Math.max(1, grown), 1, MAX_INTERVAL_DAYS);
}

/** Whether a card is due. Null `dueAt` means never reviewed, so due now. */
export function isDue(
  dueAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueAt) return true;
  return dueAt.getTime() <= now.getTime();
}
