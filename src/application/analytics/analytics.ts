/**
 * The parts of analytics that are worth keeping out of SQL.
 *
 * The queries answer "how many", which the database is good at. What they
 * cannot answer is the shape of a chart or the meaning of an absence: a weekday
 * series missing its Tuesday plots as six days, an accuracy over zero attempts
 * is not 0%, and "the cards you keep failing" has to come back in the same
 * order twice. Those are the parts here — pure functions over the rows the
 * queries return, so they are testable without a database.
 */

/** One bucket of a series: how many reviews, and how many were recalled. */
export interface SlotRow {
  slot: number;
  reviews: number;
  correct: number;
}

/**
 * Lays rows onto a fixed-size series, filling the gaps with zeros.
 *
 * The queries only return slots that have reviews; a chart needs all of them.
 * Anything landing outside the range is dropped rather than growing the array —
 * an eighth weekday cannot exist, and a chart that silently acquired one would
 * be worse than one that ignored the row.
 */
function fillSlots(size: number, rows: SlotRow[]): SlotRow[] {
  const slots: SlotRow[] = Array.from({ length: size }, (_, slot) => ({
    slot,
    reviews: 0,
    correct: 0,
  }));

  for (const row of rows) {
    const slot = slots[row.slot];
    if (!slot) continue;

    slot.reviews += Number(row.reviews);
    slot.correct += Number(row.correct);
  }

  return slots;
}

export interface WeekdayBucket {
  /** 0 is Sunday, matching `extract(dow)`. */
  weekday: number;
  reviews: number;
  correct: number;
}

/** Seven buckets, Sunday first, whatever the query returned. */
export function fillWeekdays(rows: SlotRow[]): WeekdayBucket[] {
  return fillSlots(7, rows).map(({ slot, reviews, correct }) => ({
    weekday: slot,
    reviews,
    correct,
  }));
}

export interface HourBucket {
  /** 0 is midnight, in the reader's own timezone. */
  hour: number;
  reviews: number;
  correct: number;
}

/** Twenty-four buckets, midnight first, whatever the query returned. */
export function fillHours(rows: SlotRow[]): HourBucket[] {
  return fillSlots(24, rows).map(({ slot, reviews, correct }) => ({
    hour: slot,
    reviews,
    correct,
  }));
}

/**
 * A rate as a fraction, or `null` when there is nothing to rate.
 *
 * `null` rather than 0, because "you got none of them right" and "you have not
 * tried" are different claims about the reader, and a chart that renders both
 * as an empty bar makes them the same one. Rounded to three places: enough for
 * a percentage, not enough to imply precision the sample does not have.
 */
export function accuracyOf(correct: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;

  return Math.round((correct / total) * 1000) / 1000;
}

/**
 * A row that can be ranked: how often it happened, and what to call it.
 *
 * Both rankers below break ties on `front` rather than leaving the order to the
 * database, because a list whose order changes between two loads of the same
 * page reads as a bug even when every number in it is right.
 */
export interface Ranked {
  front: string;
  count: number;
}

export interface LeechCandidate extends Ranked {
  cardId: string;
  deckId: string;
  deckTitle: string;
  lapses: number;
}

/**
 * Cards the reader keeps forgetting, worst first.
 *
 * Ranked by how often they were failed in the window, then by the lapse count
 * the card carries from its own schedule — which is the same fact over a longer
 * history, so a tie on the window is usually not a tie at all.
 */
export function rankLeeches<T extends LeechCandidate>(
  rows: T[],
  limit = 8,
): T[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.lapses - a.lapses ||
        a.front.localeCompare(b.front),
    )
    .slice(0, limit);
}

export interface MissedCandidate extends Ranked {
  cardId: string;
  deckId: string;
  deckTitle: string;
  asked: number;
}

/** Cards missed most often in quizzes, with the most-asked breaking ties. */
export function rankMissed<T extends MissedCandidate>(
  rows: T[],
  limit = 8,
): T[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.asked - a.asked ||
        a.front.localeCompare(b.front),
    )
    .slice(0, limit);
}

/**
 * A mean duration in seconds, or `null` when nothing has finished.
 *
 * Durations that are missing or negative are dropped rather than clamped: a
 * negative one means two clocks disagreed, and folding that into the average as
 * a zero would quietly pull it down.
 */
export function averageSeconds(durations: Array<number | null>): number | null {
  const usable = durations.filter(
    (value): value is number =>
      value !== null && Number.isFinite(value) && value >= 0,
  );

  if (usable.length === 0) return null;

  const total = usable.reduce((sum, value) => sum + value, 0);

  return Math.round(total / usable.length);
}
