/**
 * Study statistics that are worth computing in code rather than SQL.
 *
 * Pure functions over plain data, for the same reason the scheduler is: a streak
 * is exactly the kind of thing that is off by one for a week before anyone
 * notices, and that is testable without a database.
 */

/** One day's reviews, as the aggregate query returns them. */
export interface ReviewDay {
  /** `YYYY-MM-DD` in the reader's timezone. */
  day: string;
  reviews: number;
  /** Reviews that were not AGAIN. */
  correct: number;
}

export interface Streak {
  /** Days up to today (or the day before) with at least one review. */
  current: number;
  /** The longest run ever recorded. */
  longest: number;
}

function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Streaks from a list of review days.
 *
 * Two decisions worth stating, because both are the difference between a streak
 * people trust and one they resent:
 *
 *  - **Today not counting yet does not break the streak.** At 9am, before you
 *    have studied, a streak that had already reset would be lying about the day
 *    you are still in the middle of. The run is measured from today *or*
 *    yesterday, whichever has reviews.
 *  - **Only days with reviews appear**, so the gaps are what break a run — no
 *    need to materialise empty days to find them.
 *
 * `days` need not be sorted; duplicates are ignored.
 */
export function computeStreak(days: string[], today: string): Streak {
  const unique = [...new Set(days)].sort();

  if (unique.length === 0) return { current: 0, longest: 0 };

  // Longest run anywhere in the history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i] === nextDay(unique[i - 1])) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // Current run: counted only if it reaches today or yesterday.
  const last = unique[unique.length - 1];
  let current = 0;

  if (last === today || last === previousDay(today)) {
    current = 1;
    for (let i = unique.length - 1; i > 0; i -= 1) {
      if (unique[i - 1] === previousDay(unique[i])) current += 1;
      else break;
    }
  }

  return { current, longest: Math.max(longest, current) };
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * How much of what the reader has seen has stuck.
 *
 * AGAIN is the only grade that means "did not recall", so retention is the share
 * of reviews that were not AGAIN. Null rather than zero when there is nothing to
 * divide by — zero would read as "you remember nothing", which is a different
 * and much worse claim than "there is no data yet".
 */
export function retentionRate(days: ReviewDay[]): number | null {
  const reviews = days.reduce((sum, d) => sum + d.reviews, 0);
  if (reviews === 0) return null;

  const correct = days.reduce((sum, d) => sum + d.correct, 0);
  return correct / reviews;
}

/**
 * Fills gaps so a chart can plot a continuous axis.
 *
 * A bar chart drawn only from days that have data silently compresses the gaps,
 * which makes an irregular habit look like a consistent one — the opposite of
 * what the chart is for.
 */
export function fillDays(
  days: ReviewDay[],
  options: { from: string; to: string },
): ReviewDay[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const filled: ReviewDay[] = [];

  let cursor = options.from;
  // Guard against a malformed range turning into an infinite loop.
  for (let i = 0; i < 400 && cursor <= options.to; i += 1) {
    filled.push(byDay.get(cursor) ?? { day: cursor, reviews: 0, correct: 0 });
    cursor = nextDay(cursor);
  }

  return filled;
}
