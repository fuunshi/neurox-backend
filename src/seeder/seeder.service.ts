import { ActivityRecorderService } from "@/application/activities/activity-recorder.service";
import { computeStreak } from "@/application/study/stats";
import {
  ACTIVITY_TYPES,
  CONTEXT_TYPES,
  ENTITY_TYPES,
} from "@/common/constant/activity";
import {
  CARD_STATUS,
  GENERATION_JOB_STATUS,
  QUIZ_ATTEMPT_STATUS,
  REVIEW_RATING,
  SOURCE_STATUS,
  SOURCE_TYPE,
  type ReviewRating,
} from "@/common/constant/enums";
import {
  Activity,
  CardReview,
  Deck,
  FlashCard,
  GenerationJob,
  QuizAnswer,
  QuizAttempt,
  Source,
  User,
  UserProfile,
} from "@/database/entities";
import {
  initialSchedulingState,
  schedule,
  type SchedulingState,
} from "@/application/study/scheduling";
import { buildQuestions } from "@/application/quiz/questions";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable, Logger } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { DEMO_DECKS, DEMO_SOURCES, type DemoDeck } from "./demo-content";

/**
 * A demo account with a plausible past.
 *
 * ## Why it replays the scheduler
 *
 * Every review is run through the app's own `schedule()` function, so the
 * history is one the algorithm would actually have produced. Hand-written
 * intervals look fine on a card and then disagree with the streak, the
 * retention figure and the forecast — which is worse than no demo data,
 * because it makes the screens that *are* working look broken.
 *
 * ## Timestamps are applied after the insert
 *
 * Every entity here sets `createdAt` (and friends) through MikroORM's
 * `onCreate`, which owns the value at insert time. The past dates a demo needs
 * therefore cannot be passed to `em.create` — they have to be written
 * afterwards, with `nativeUpdate`, which is plain SQL and runs no hooks. That
 * is why the creation methods below are followed by a backdating pass.
 *
 * ## Re-running resets
 *
 * `seed()` deletes the demo account's own data first, so running it twice gives
 * the same account rather than two of everything. It only ever touches rows
 * belonging to `DEMO_EMAIL`. The randomness is seeded, so two runs produce the
 * same account — a demo that differs every time is hard to screenshot or
 * describe.
 */

export const DEMO_EMAIL = "admin@neurox.ai";
export const DEMO_PASSWORD = "demo_admin@123";

const DEMO_TIMEZONE = "Asia/Kathmandu";

export interface SeedReport {
  email: string;
  decks: number;
  cards: number;
  reviews: number;
  sources: number;
  quizzes: number;
  dueNow: number;
  streak: number;
  daysOfHistory: number;
}

/** A deterministic PRNG, so the demo is the same account on every run. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Picks a grade weighted by how well the reader is meant to know this deck. */
function pickRating(strength: number, random: () => number): ReviewRating {
  const struggle = 1 - strength;
  const again = 0.08 + struggle * 0.28;
  const hard = 0.1 + struggle * 0.18;
  const easy = 0.05 + strength * 0.3;

  const roll = random();

  if (roll < again) return REVIEW_RATING.AGAIN;
  if (roll < again + hard) return REVIEW_RATING.HARD;
  if (roll < again + hard + easy) return REVIEW_RATING.EASY;

  return REVIEW_RATING.GOOD;
}

/**
 * When the reader sat down that day.
 *
 * A session is anchored at a plausible hour rather than the same one every
 * time. Pinning every review to nine in the morning makes the "when do you
 * study" chart a single bar — a demo showing the generator rather than the
 * reader. Mornings, the occasional lunchtime, and evenings are the three
 * windows most studying actually falls into, weighted the way a week tends to
 * go: mornings most often, evenings a close second.
 *
 * Drawn from the seeded source like everything else here, so two runs still
 * produce the same account.
 */
/** Midnight, so a day-by-day walk advances by whole days and not by an hour. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function sessionStartOf(date: Date, random: () => number): Date {
  const copy = new Date(date);
  const window = random();

  const hour =
    window < 0.4
      ? 7 + Math.floor(random() * 3) // 7–9am
      : window < 0.55
        ? 12 + Math.floor(random() * 2) // lunchtime
        : 20 + Math.floor(random() * 4); // 8–11pm

  copy.setHours(hour, Math.floor(random() * 30), 0, 0);
  return copy;
}

interface PlannedReview {
  card: FlashCard;
  rating: ReviewRating;
  reviewedAt: Date;
  before: SchedulingState;
  dueAtBefore: Date | null;
  after: ReturnType<typeof schedule>;
}

@Injectable()
export class SeederService {
  private readonly logger = new Logger(SeederService.name);

  /**
   * A forked manager for the whole run.
   *
   * MikroORM v7 refuses context-specific actions on the global manager, and
   * this process has no request to bind one to — the same reason the worker
   * forks. One fork for the run rather than one per call, so the identity map
   * stays coherent while the history is being built.
   */
  private fork!: EntityManager;

  constructor(
    private readonly em: EntityManager,
    private readonly activities: ActivityRecorderService,
  ) {}

  async seed(): Promise<SeedReport> {
    this.fork = this.em.fork();

    const random = makeRandom(20260924);
    const now = new Date();

    const user = await this.ensureUser();
    await this.wipe(user);

    const sources = await this.createSources(user, now);
    const decks = await this.createDecks(user, sources, now);
    const history = await this.fillHistory(user, decks, random, now);
    const quizzes = await this.createQuizzes(user, decks, random, now);

    await this.createActivities(user, decks, now);

    return {
      email: DEMO_EMAIL,
      decks: decks.length,
      cards: decks.reduce((sum, entry) => sum + entry.cards.length, 0),
      reviews: history.reviews,
      sources: sources.length,
      quizzes,
      dueNow: history.dueNow,
      streak: history.streak,
      daysOfHistory: Math.max(...decks.map((entry) => entry.demo.studyDays)),
    };
  }

  /**
   * Creates the demo account, or brings an existing one back to a usable state.
   *
   * The password is re-hashed and the flags forced on every run, so an account
   * that a previous session locked, unverified or changed the password of is
   * usable again without a manual reset.
   */
  private async ensureUser(): Promise<User> {
    const password = await bcrypt.hash(DEMO_PASSWORD, 10);

    const existing = await this.fork.findOne(
      User,
      { email: DEMO_EMAIL },
      { populate: ["profile"] },
    );

    if (existing) {
      existing.password = password;
      existing.isActive = true;
      existing.emailVerified = true;
      existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
      existing.passwordChangedAt = new Date();
      existing.lockedUntil = null;
      existing.failedLoginAttempts = 0;
      existing.forcePasswordChange = false;
      existing.status = "ACTIVE";
      existing.deletedAt = null;
      existing.twoFactorEnabled = false;
      existing.twoFactorEnforced = false;
      existing.twoFactorSecret = null;

      if (existing.profile) {
        existing.profile.firstName = "Demo";
        existing.profile.lastName = "Admin";
        existing.profile.timezone = DEMO_TIMEZONE;
      } else {
        this.fork.create(UserProfile, {
          user: existing,
          firstName: "Demo",
          lastName: "Admin",
          timezone: DEMO_TIMEZONE,
        });
      }

      await this.fork.flush();
      return existing;
    }

    const user = this.fork.create(User, {
      email: DEMO_EMAIL,
      username: "demoadmin",
      password,
      role: "ADMIN",
      status: "ACTIVE",
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
    });

    this.fork.create(UserProfile, {
      user,
      firstName: "Demo",
      lastName: "Admin",
      timezone: DEMO_TIMEZONE,
      bio: "Sample account, with a plausible past.",
    });

    await this.fork.flush();
    return user;
  }

  /**
   * Removes the demo account's domain data.
   *
   * **Ordered children-first**, and that is the whole content of this method.
   * `card_review` and `quiz_answer` both reference `flash_card`, so deleting
   * cards before their history violates a foreign key and the whole reset
   * aborts — which presents as "the seeder is broken" rather than "the reset
   * ran in the wrong order", and only on the second run, when there is history
   * to conflict with.
   */
  private async wipe(user: User): Promise<void> {
    const decks = await this.fork.find(Deck, { user: user.id });
    const deckIds = decks.map((deck) => deck.id);

    // Rows that reference a card or an attempt, before the things they point at.
    await this.fork.nativeDelete(QuizAnswer, { user: user.id });
    await this.fork.nativeDelete(QuizAttempt, { user: user.id });
    await this.fork.nativeDelete(CardReview, { user: user.id });

    // Rows that reference a deck or a source.
    await this.fork.nativeDelete(GenerationJob, { user: user.id });
    await this.fork.nativeDelete(Activity, { actor: user.id });

    if (deckIds.length > 0) {
      await this.fork.nativeDelete(FlashCard, { deck: { $in: deckIds } });
    }

    await this.fork.nativeDelete(Deck, { user: user.id });
    await this.fork.nativeDelete(Source, { user: user.id });
  }

  private async createSources(user: User, now: Date): Promise<Source[]> {
    const created: Source[] = [];

    DEMO_SOURCES.forEach((demo) => {
      created.push(
        this.fork.create(Source, {
          user,
          type: SOURCE_TYPE.TEXT,
          status: SOURCE_STATUS.READY,
          title: demo.title,
          // Length and excerpt are derived by the API from this, not stored.
          rawText: demo.text,
        }),
      );
    });

    // One source that never finished extracting, so the failure state is
    // reachable without having to break something on purpose.
    created.push(
      this.fork.create(Source, {
        user,
        type: SOURCE_TYPE.PDF,
        status: SOURCE_STATUS.FAILED,
        title: "Scanned handout (no text layer)",
        fileName: "handout-scan.pdf",
        sizeBytes: 842_119,
        error:
          "No text could be extracted. The file appears to be a scan without a text layer.",
      }),
    );

    await this.fork.flush();

    for (const [index, source] of created.entries()) {
      await this.fork.nativeUpdate(
        Source,
        { id: source.id },
        {
          createdAt: this.daysBefore(now, 45 - index * 3),
        },
      );
    }

    return created;
  }

  private async createDecks(
    user: User,
    sources: Source[],
    now: Date,
  ): Promise<
    { deck: Deck; cards: FlashCard[]; demo: DemoDeck; startedAt: Date }[]
  > {
    const out: {
      deck: Deck;
      cards: FlashCard[];
      demo: DemoDeck;
      startedAt: Date;
    }[] = [];

    for (const demo of DEMO_DECKS) {
      const startedAt = this.daysBefore(now, demo.studyDays);

      const deck = this.fork.create(Deck, {
        user,
        title: demo.title,
        description: demo.description,
      });

      const cards = demo.cards.map((card, index) =>
        this.fork.create(FlashCard, {
          deck,
          front: card.front,
          back: card.back,
          hint: card.hint ?? null,
          // Every card is ACTIVE: a deck of drafts can be neither studied nor
          // quizzed, which would leave the demo unable to show either.
          status: CARD_STATUS.ACTIVE,
          position: index,
        }),
      );

      // Provenance, so the knowledge graph has real edges to draw.
      const linked = DEMO_SOURCES.find((source) => source.feeds === demo.title);
      const source = linked
        ? sources.find((entry) => entry.title === linked.title)
        : undefined;

      if (source && linked) {
        const fromSource = Math.max(1, Math.round(cards.length * linked.share));

        const job = this.fork.create(GenerationJob, {
          user,
          deck,
          source,
          status: GENERATION_JOB_STATUS.SUCCEEDED,
          provider: "heuristic",
          cardsRequested: fromSource,
          cardsCreated: fromSource,
          startedAt,
          finishedAt: startedAt,
        });

        for (const card of cards.slice(0, fromSource)) {
          card.generationJob = job;
        }
      }

      out.push({ deck, cards, demo, startedAt });
    }

    await this.fork.flush();

    for (const entry of out) {
      await this.fork.nativeUpdate(
        Deck,
        { id: entry.deck.id },
        {
          createdAt: entry.startedAt,
        },
      );

      for (const card of entry.cards) {
        await this.fork.nativeUpdate(
          FlashCard,
          { id: card.id },
          {
            createdAt: entry.startedAt,
          },
        );
      }
    }

    return out;
  }

  /**
   * Builds each card's review history by walking the calendar day by day.
   *
   * Day-by-day rather than card-by-card, because the thing being simulated is a
   * *reader*: they sit down on some days and not others and review whatever has
   * come due. Simulating each card in isolation would produce histories that
   * are individually plausible and collectively impossible — a reader who
   * happened to study every one of their decks on exactly the days each needed
   * it.
   */
  private async fillHistory(
    user: User,
    decks: {
      deck: Deck;
      cards: FlashCard[];
      demo: DemoDeck;
      startedAt: Date;
    }[],
    random: () => number,
    now: Date,
  ): Promise<{ reviews: number; dueNow: number; streak: number }> {
    const state = new Map<string, SchedulingState>();
    const due = new Map<string, Date | null>();
    const strength = new Map<string, number>();

    /*
     * A few cards per deck are left untouched, as though they were added
     * recently.
     *
     * Without this every card in every deck has been reviewed at least once,
     * and the backend counts "learned" as "has ever been reviewed" — so a
     * heavily-used account shows 100% of its cards graduated, which reads as a
     * broken figure rather than a good one. It is also just untrue of a real
     * deck: material gets added over time, and the newest cards are the ones
     * still waiting to be learned.
     *
     * They are taken from the end of each deck so the ids stay stable between
     * runs, and they keep `dueAt: null`, which is what the study pool reads as
     * "new".
     */
    const allCards: FlashCard[] = [];

    for (const entry of decks) {
      const fresh = Math.max(1, Math.round(entry.cards.length * 0.15));
      const participating = entry.cards.slice(0, entry.cards.length - fresh);

      for (const card of participating) {
        allCards.push(card);
        state.set(card.id, initialSchedulingState());
        due.set(card.id, entry.startedAt);
        strength.set(card.id, entry.demo.strength);
      }
    }

    const planned: PlannedReview[] = [];

    const earliest = Math.min(
      ...decks.map((entry) => entry.startedAt.getTime()),
    );

    for (
      let cursor = startOfDay(new Date(earliest));
      cursor <= now;
      cursor = this.daysAfter(cursor, 1)
    ) {
      // Not every day is a study day. A history with no gaps reads as machine
      // output and flattens the activity chart into a solid block.
      if (random() < 0.22) continue;

      // Drawn per day rather than carried by the loop variable, which would
      // put every session of the last two months at the same minute.
      const day = sessionStartOf(cursor, random);

      // A session that has not happened yet is not a session. Without this the
      // last day of the walk can be planned for this evening.
      if (day > now) continue;

      for (const card of allCards) {
        const dueAt = due.get(card.id);
        if (!dueAt || dueAt > day) continue;

        const before = state.get(card.id) ?? initialSchedulingState();
        const rating = pickRating(strength.get(card.id) ?? 0.5, random);
        const at = new Date(day.getTime() + Math.floor(random() * 8) * 60_000);
        const after = schedule(before, rating, at);

        planned.push({
          card,
          rating,
          reviewedAt: at,
          before,
          dueAtBefore: dueAt,
          after,
        });

        state.set(card.id, after);
        due.set(card.id, after.dueAt);
      }
    }

    /*
     * Fill any gap in the last week, so the account opens on a streak.
     *
     * The walk above skips roughly a fifth of all days and only reviews what
     * has come due — which is right, and which also means today can easily be
     * one of the quiet ones. A demo whose first impression is "0-day streak" is
     * hiding one of the few things this app does that is worth showing, and the
     * fix is not to fake the number but to have the reader sit down on those
     * days.
     *
     * Days that already have a review are left alone, and the loop runs
     * oldest-first so each card's state still follows the order its reviews
     * actually happened in.
     */
    for (let back = 6; back >= 0; back -= 1) {
      const day = sessionStartOf(this.daysBefore(now, back), random);

      // Same reason as above: a session drawn for this evening has not happened
      // yet, and a review recorded in the future would be a lie the schedule
      // then has to carry.
      if (day > now) continue;

      if (
        planned.some(
          (entry) => this.dayKey(entry.reviewedAt) === this.dayKey(day),
        )
      ) {
        continue;
      }

      // Anything already due, or failing that the whole deck — reviewing a card
      // early is something a reader does, so it is not a fiction.
      const dueToday = allCards.filter((card) => {
        const dueAt = due.get(card.id);
        return dueAt !== null && dueAt !== undefined && dueAt <= day;
      });

      const pool = dueToday.length > 0 ? dueToday : allCards;
      const card = pool[Math.floor(random() * pool.length)];

      if (!card) continue;

      const before = state.get(card.id) ?? initialSchedulingState();
      const rating = pickRating(strength.get(card.id) ?? 0.5, random);
      const at = new Date(day.getTime() + Math.floor(random() * 8) * 60_000);
      const after = schedule(before, rating, at);

      planned.push({
        card,
        rating,
        reviewedAt: at,
        before,
        dueAtBefore: due.get(card.id) ?? null,
        after,
      });

      state.set(card.id, after);
      due.set(card.id, after.dueAt);
    }

    const rows = planned.map((entry) =>
      this.fork.create(CardReview, {
        card: entry.card,
        user,
        rating: entry.rating,
        intervalBeforeDays: entry.before.intervalDays,
        intervalAfterDays: entry.after.intervalDays,
        easeAfter: entry.after.easeFactor,
        // The snapshot undo restores. Written here too, so undo works on demo
        // data rather than refusing every row as too old.
        previousState: {
          intervalDays: entry.before.intervalDays,
          easeFactor: entry.before.easeFactor,
          repetitions: entry.before.repetitions,
          lapses: entry.before.lapses,
          dueAt: entry.dueAtBefore?.toISOString() ?? null,
          lastReviewedAt: null,
        },
      }),
    );

    // The card's own schedule, which is what study actually reads.
    for (const card of allCards) {
      const finalState = state.get(card.id) ?? initialSchedulingState();
      const last = [...planned]
        .reverse()
        .find((entry) => entry.card.id === card.id);

      card.intervalDays = finalState.intervalDays;
      card.easeFactor = finalState.easeFactor;
      card.repetitions = finalState.repetitions;
      card.lapses = finalState.lapses;
      card.dueAt = due.get(card.id) ?? null;
      card.lastReviewedAt = last?.reviewedAt ?? null;
    }

    await this.fork.flush();

    /*
     * A slice of cards is left overdue.
     *
     * Without this the simulation ends with every card scheduled in the future,
     * because that is what the scheduler does — and the demo would open on
     * "nothing is due", the one screen a demo most needs to show. It is not a
     * contradiction of the schedule: a card whose due date passed and was not
     * reviewed is exactly what an overdue card is.
     */
    for (const card of allCards) {
      if (random() > 0.3) continue;

      const daysAgo = Math.floor(random() * 6) + 1;

      await this.fork.nativeUpdate(
        FlashCard,
        { id: card.id },
        {
          dueAt: this.daysBefore(now, daysAgo),
        },
      );
    }

    // The real timestamps, applied after insert because `onCreate` owns the
    // column at insert time.
    for (const [index, row] of rows.entries()) {
      await this.fork.nativeUpdate(
        CardReview,
        { id: row.id },
        {
          reviewedAt: planned[index].reviewedAt,
        },
      );
    }

    const dueNow = await this.fork.count(FlashCard, {
      deck: { $in: decks.map((entry) => entry.deck.id) },
      dueAt: { $lte: now },
    });

    return {
      reviews: rows.length,
      dueNow,
      // The app's own function, not a second opinion about what a streak is.
      // The local version this replaces counted back from today and stopped at
      // the first empty day, so it reported `0-day streak` for an account whose
      // `/study/overview` was reporting `current: 1` — `computeStreak` measures
      // the run from today *or* yesterday, because a day you are still in the
      // middle of has not broken anything.
      //
      // It mattered: the log line is the only thing anyone reads after seeding,
      // and a zero there looks like a broken seeder rather than a difference of
      // opinion about the first day.
      streak: computeStreak(
        // Bucketed in the demo user's timezone, because that is the bucket the
        // app reads. The reviews are written at server-local (UTC) hours, so
        // an 8pm session is already the next day in Kathmandu — the seeder's
        // own UTC day keys and the ones `/study/overview` groups by disagree
        // for any review after 18:15 UTC, and the app is the one being
        // demoed. Same timestamps, same timezone, same answer.
        planned.map((entry) => this.dayKeyIn(entry.reviewedAt, DEMO_TIMEZONE)),
        this.dayKeyIn(now, DEMO_TIMEZONE),
      ).current,
    };
  }

  private async createQuizzes(
    user: User,
    decks: { deck: Deck; cards: FlashCard[]; demo: DemoDeck }[],
    random: () => number,
    now: Date,
  ): Promise<number> {
    const formats = ["MULTIPLE_CHOICE", "CLOZE", "MATCHING"] as const;
    let created = 0;

    for (let index = 0; index < 4; index += 1) {
      const entry = decks[index % decks.length];
      if (entry.cards.length < 2) continue;

      const questions = buildQuestions(
        entry.cards.map((card) => ({
          id: card.id,
          front: card.front,
          back: card.back,
          hint: card.hint ?? null,
        })),
        formats[index % formats.length],
        { count: 6, random },
      );

      if (questions.length === 0) continue;

      const startedAt = this.daysBefore(now, 4 + index * 6);

      const attempt = this.fork.create(QuizAttempt, {
        user,
        deck: entry.deck,
        format: formats[index % formats.length],
        status: QUIZ_ATTEMPT_STATUS.COMPLETED,
        questionCount: questions.length,
        questions,
        finishedAt: new Date(startedAt.getTime() + 4 * 60_000),
      });

      let correct = 0;

      for (const question of questions) {
        const getsItRight = random() < entry.demo.strength;
        const chosen = getsItRight
          ? question.correct
          : (question.options.find((option) => option !== question.correct) ??
            question.correct);

        if (getsItRight) correct += 1;

        this.fork.create(QuizAnswer, {
          attempt,
          user,
          card: entry.cards.find((card) => card.id === question.cardId) ?? null,
          position: question.position,
          chosen,
          correct: getsItRight,
        });
      }

      attempt.correctCount = correct;

      await this.fork.flush();

      await this.fork.nativeUpdate(
        QuizAttempt,
        { id: attempt.id },
        {
          startedAt,
          createdAt: startedAt,
        },
      );

      await this.fork.nativeUpdate(
        QuizAnswer,
        { attempt: attempt.id },
        {
          answeredAt: startedAt,
        },
      );

      created += 1;
    }

    return created;
  }

  /** The activity feed, so it is not empty on an otherwise full account. */
  private async createActivities(
    user: User,
    decks: { deck: Deck; demo: DemoDeck; startedAt: Date }[],
    now: Date,
  ): Promise<void> {
    const entries = [
      ...decks.map((entry) => ({
        type: ACTIVITY_TYPES.DECK_CREATED,
        entityId: entry.deck.id,
        at: entry.startedAt,
        data: { title: entry.deck.title },
      })),
      {
        type: ACTIVITY_TYPES.CARDS_GENERATED,
        entityId: decks[0]?.deck.id ?? user.id,
        at: this.daysBefore(now, 3),
        data: { cardsCreated: 6, provider: "heuristic" },
      },
    ];

    for (const entry of entries) {
      // Recorded through the same best-effort service everything else uses, so
      // the demo's feed is built exactly the way a real one is.
      // The forked manager is passed as the recorder's transaction so the
      // entries are written through the same context as everything else.
      await this.activities.record(
        {
          type: entry.type,
          entityType: ENTITY_TYPES.DECK,
          entityId: entry.entityId,
          actorId: user.id,
          contextType: CONTEXT_TYPES.USER,
          contextId: user.id,
          data: entry.data,
        },
        this.fork,
      );
    }

    const recent = await this.fork.find(
      Activity,
      { actor: user.id },
      { orderBy: { createdAt: "asc" } },
    );

    for (const [index, activity] of recent.entries()) {
      const entry = entries[index];
      if (!entry) continue;

      await this.fork.nativeUpdate(
        Activity,
        { id: activity.id },
        {
          createdAt: entry.at,
        },
      );
    }
  }

  /** The day a timestamp falls on, in UTC. Used by the walk's own day maths. */
  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /**
   * The day a timestamp falls on, in a named timezone.
   *
   * `en-CA` is the locale that formats as `YYYY-MM-DD` — the shape
   * `computeStreak` compares and the shape the app's aggregate query returns.
   * Using it avoids hand-rolling an offset, which is the kind of arithmetic
   * that is wrong twice a year in most of the world.
   */
  private dayKeyIn(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
  }

  private daysBefore(from: Date, days: number): Date {
    return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private daysAfter(from: Date, days: number): Date {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
