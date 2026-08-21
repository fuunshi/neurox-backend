import { CardResponseDTO } from "@/application/deck/dto/deck.dto";
import { CARD_STATUS } from "@/common/constant/enums";
import { isUuid } from "@/common/utils/validation/is-uuid.util";
import {
  CardImproverService,
  type CardImprovement,
} from "./card-improver.service";
import type { ReviewRating } from "@/common/constant/enums/review-rating.enum";
import {
  buildPage,
  decodeCursor,
  keysetAfter,
} from "@/common/utils/pagination/cursor.util";
import { CardReview, Deck, FlashCard, User } from "@/database/entities";
import { EntityManager, QueryOrder } from "@mikro-orm/postgresql";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  DeckStatsDTO,
  StudyInclude,
  StudyOverviewDTO,
  STUDY_INCLUDE,
} from "./dto/study.dto";
import { schedule, type SchedulingState } from "./scheduling";
import { computeStreak, fillDays, retentionRate } from "./stats";

/**
 * Studying: what is due, and what a review does to the schedule.
 *
 * The scheduling maths itself lives in `scheduling.ts` as a pure function — this
 * service is about ownership, persistence and the review log.
 *
 * Reviews deliberately do **not** write to the activity feed. A review is a
 * frequent, low-signal event; at a few hundred a day it would bury everything
 * else. `card_review` is its own record, and the feed is for changes to the
 * material.
 */
@Injectable()
export class StudyService {
  private readonly logger = new Logger(StudyService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly improver: CardImproverService,
  ) {}

  /**
   * The cards to study now.
   *
   * Ordered by when they are due, with never-reviewed cards first: a new card
   * has no `dueAt`, and the reader should meet new material before re-meeting
   * old material. `ASC_NULLS_FIRST` is what expresses that.
   *
   * The stats come back with the pool rather than from a second request — the
   * API throttles per endpoint, and the study screen needs both to render.
   */
  async getStudyPool(
    userId: string,
    deckId: string,
    dto: { limit: number; cursor?: string; include?: StudyInclude },
  ) {
    await this.findOwnedDeck(this.em, userId, deckId);

    const includeAll = dto.include === STUDY_INCLUDE.ALL;

    const where = {
      deck: deckId,
      status: CARD_STATUS.ACTIVE,
      ...(includeAll
        ? {}
        : {
            /**
             * What counts as "in play". Kept in step with the `due` aggregate in
             * `statsFor` — if the two disagree, the header reports a different
             * number from the list beneath it.
             *
             *  - never reviewed (`dueAt` null) — new material;
             *  - past its due date;
             *  - in a relearn step (`intervalDays` 0), which is a card the
             *    reader just forgot. Its `dueAt` is ten minutes out, but
             *    excluding it would mean failing a card *lowered* the due count
             *    and removed it from the session it is supposed to repeat in.
             */
            $or: [
              { dueAt: null },
              { dueAt: { $lte: new Date() } },
              { intervalDays: 0 },
            ],
          }),
      ...keysetAfter(decodeCursor(dto.cursor)),
    };

    const rows = await this.em.find(FlashCard, where, {
      orderBy: includeAll
        ? { createdAt: "desc", id: "desc" }
        : { dueAt: QueryOrder.ASC_NULLS_FIRST, createdAt: "asc", id: "asc" },
      limit: dto.limit + 1,
      populate: ["deck"],
    });

    const page = buildPage(rows, dto.limit);

    return {
      data: page.data.map((card) => CardResponseDTO.from(card)),
      pagination: page.pagination,
      stats: await this.statsFor(this.em, userId, deckId),
    };
  }

  /**
   * Records one review and reschedules the card.
   *
   * The card and the log row are written in one transaction: a schedule that
   * moved without a record of why, or a record of a review that did not move the
   * schedule, are both worse than the write failing outright.
   */
  async reviewCard(userId: string, cardId: string, rating: ReviewRating) {
    const card = await this.findOwnedCard(this.em, userId, cardId);

    if (card.status !== CARD_STATUS.ACTIVE) {
      throw new BadRequestException(
        "Only cards you have kept can be studied. Accept it in the deck first.",
      );
    }

    const before: SchedulingState = {
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
      repetitions: card.repetitions,
      lapses: card.lapses,
    };

    const now = new Date();
    const scheduled = schedule(before, rating, now);

    card.intervalDays = scheduled.intervalDays;
    card.easeFactor = scheduled.easeFactor;
    card.repetitions = scheduled.repetitions;
    card.lapses = scheduled.lapses;
    card.dueAt = scheduled.dueAt;
    card.lastReviewedAt = now;

    this.em.create(CardReview, {
      card,
      user: this.em.getReference(User, userId),
      rating,
      intervalBeforeDays: scheduled.intervalBeforeDays,
      intervalAfterDays: scheduled.intervalDays,
      easeAfter: scheduled.easeFactor,
      reviewedAt: now,
    });

    await this.em.flush();

    this.logger.debug(
      `Reviewed card ${card.id} as ${rating}: ${scheduled.intervalBeforeDays}d → ${scheduled.intervalDays}d`,
    );

    return {
      cardId: card.id,
      rating,
      scheduling: {
        intervalDays: scheduled.intervalDays,
        dueAt: scheduled.dueAt,
        repetitions: scheduled.repetitions,
        lapses: scheduled.lapses,
      },
    };
  }

  /**
   * Proposes a rewrite of a card the reader keeps forgetting.
   *
   * Reads the card, hands the model its wording and its lapse count, and returns
   * the suggestion untouched. Nothing is written: the reader accepts it through
   * the ordinary edit endpoint, so there stays exactly one path that changes a
   * card — and one place the schedule gets reset.
   */
  async improveCard(userId: string, cardId: string): Promise<CardImprovement> {
    const card = await this.findOwnedCard(this.em, userId, cardId);

    return this.improver.improve({
      front: card.front,
      back: card.back,
      hint: card.hint,
      // The lapse count is what makes this specific rather than generic advice
      // about writing cards.
      lapses: card.lapses,
      sourceTitle: null,
    });
  }

  /** Counts for one deck, for the deck screen and the study header. */
  async getDeckStats(userId: string, deckId: string): Promise<DeckStatsDTO> {
    await this.findOwnedDeck(this.em, userId, deckId);
    return this.statsFor(this.em, userId, deckId);
  }

  /**
   * Everything the stats screen needs, across every deck.
   *
   * One endpoint rather than four, because the API throttles per endpoint and
   * this screen is a single view — four requests would spend four of the
   * endpoint's budget to draw one page.
   *
   * Day boundaries are computed in the **reader's** timezone, taken from their
   * profile. Using the server's would mean someone in Auckland seeing their
   * evening session counted as tomorrow, and a streak that resets at an
   * arbitrary hour is worse than no streak.
   */
  async getOverview(userId: string): Promise<StudyOverviewDTO> {
    const timezone = await this.timezoneFor(this.em, userId);
    const today = await this.currentDay(this.em, timezone);

    const [dailyRows, forecastRows, totalsRows, activeRows] = await Promise.all(
      [
        // Reviews per day over the window. Only days with reviews come back; the
        // gaps are filled in code so the chart plots a continuous axis rather than
        // compressing a quiet week into nothing.
        this.em
          .getConnection()
          .execute<Array<{ day: string; reviews: number; correct: number }>>(
            `select (r."reviewed_at" at time zone ?::text)::date::text as day,
                count(*)::int as reviews,
                count(*) filter (where r."rating" <> 'AGAIN')::int as correct
           from "card_review" r
          where r."user_id" = ?
            and r."reviewed_at" >= now() - interval '90 days'
          group by 1
          order by 1`,
            [timezone, userId],
          ),

        this.em.getConnection().execute<Array<{ day: string; due: number }>>(
          `select (c."due_at" at time zone ?::text)::date::text as day,
                count(*)::int as due
           from "flash_card" c
           join "deck" d on d."id" = c."deck_id"
          where d."user_id" = ?
            and d."deleted_at" is null
            and c."deleted_at" is null
            and c."status" = 'ACTIVE'
            and c."due_at" is not null
            and c."due_at" >= now()
            and c."due_at" < now() + interval '14 days'
          group by 1
          order by 1`,
          [timezone, userId],
        ),

        this.em
          .getConnection()
          .execute<Array<{ reviews: number; due_now: number }>>(
            `select
             (select count(*)::int from "card_review" r where r."user_id" = ?) as reviews,
             (select count(*)::int
                from "flash_card" c
                join "deck" d on d."id" = c."deck_id"
               where d."user_id" = ? and d."deleted_at" is null
                 and c."deleted_at" is null
                 and c."status" = 'ACTIVE'
                 and (c."due_at" is null or c."due_at" <= now() or c."interval_days" = 0)
             ) as due_now`,
            [userId, userId],
          ),

        this.em
          .getConnection()
          .execute<Array<{ active: number; learned: number }>>(
            `select count(*) filter (where c."status" = 'ACTIVE')::int as active,
                count(*) filter (
                  where c."status" = 'ACTIVE' and c."last_reviewed_at" is not null
                )::int as learned
           from "flash_card" c
           join "deck" d on d."id" = c."deck_id"
          where d."user_id" = ? and d."deleted_at" is null and c."deleted_at" is null`,
            [userId],
          ),
      ],
    );

    const windowDays = 30;
    const from = shiftDay(today, -(windowDays - 1));

    const daily = fillDays(
      dailyRows.map((row) => ({
        day: row.day,
        reviews: Number(row.reviews),
        correct: Number(row.correct),
      })),
      { from, to: today },
    );

    // The forecast is filled the same way, so a quiet day reads as a quiet day
    // rather than as a gap in the axis.
    const forecast = fillDays(
      forecastRows.map((row) => ({ day: row.day, reviews: 0, correct: 0 })),
      { from: today, to: shiftDay(today, 13) },
    ).map((entry) => ({
      day: entry.day,
      due: Number(forecastRows.find((row) => row.day === entry.day)?.due ?? 0),
    }));

    return {
      totals: {
        reviews: Number(totalsRows[0]?.reviews ?? 0),
        activeCards: Number(activeRows[0]?.active ?? 0),
        learnedCards: Number(activeRows[0]?.learned ?? 0),
        // Measured over the window the chart shows, so the number and the
        // picture beside it cannot disagree.
        retention: retentionRate(daily),
        dueNow: Number(totalsRows[0]?.due_now ?? 0),
      },
      streak: computeStreak(
        dailyRows.map((row) => row.day),
        today,
      ),
      daily,
      forecast,
      timezone,
    };
  }

  /**
   * The reader's timezone, falling back to UTC.
   *
   * Read from the profile rather than taken from a request header: a stats page
   * that changed depending on which device it was opened on would not be a
   * record of anything.
   */
  private async timezoneFor(
    em: EntityManager,
    userId: string,
  ): Promise<string> {
    const rows = await em.getConnection().execute<Array<{ timezone: string }>>(
      `select coalesce(p."timezone", 'UTC') as timezone
         from "user_profile" p
        where p."user_id" = ? and p."deleted_at" is null
        limit 1`,
      [userId],
    );

    return rows[0]?.timezone || "UTC";
  }

  /**
   * Today's date in a timezone, asked of the database.
   *
   * One authority on what "today" means rather than two clocks that can
   * disagree about midnight.
   */
  private async currentDay(
    em: EntityManager,
    timezone: string,
  ): Promise<string> {
    const rows = await em
      .getConnection()
      .execute<
        Array<{ day: string }>
      >(`select (now() at time zone ?::text)::date::text as day`, [timezone]);

    return rows[0]?.day ?? new Date().toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * All of a deck's counts in one round trip.
   *
   * Raw, because this is six filtered aggregates over one table: expressed
   * through the entity API it would be six queries. The predicate mirrors the
   * entity's soft-delete filter, which raw SQL bypasses.
   */
  private async statsFor(
    em: EntityManager,
    userId: string,
    deckId: string,
  ): Promise<DeckStatsDTO> {
    const [counts] = await em.getConnection().execute<
      Array<{
        total: number;
        active: number;
        draft: number;
        archived: number;
        due: number;
        new_cards: number;
        learned: number;
        learning: number;
      }>
    >(
      `select
         count(*)::int as total,
         count(*) filter (where "status" = 'ACTIVE')::int as active,
         count(*) filter (where "status" = 'DRAFT')::int as draft,
         count(*) filter (where "status" = 'ARCHIVED')::int as archived,
         count(*) filter (
           where "status" = 'ACTIVE'
             and ("due_at" is null or "due_at" <= now() or "interval_days" = 0)
         )::int as due,
         count(*) filter (
           where "status" = 'ACTIVE' and "last_reviewed_at" is null
         )::int as new_cards,
         count(*) filter (
           where "status" = 'ACTIVE'
             and "interval_days" = 0 and "due_at" is not null
         )::int as learning,
         count(*) filter (
           where "status" = 'ACTIVE' and "last_reviewed_at" is not null
         )::int as learned
       from "flash_card"
      where "deck_id" = ? and "deleted_at" is null`,
      [deckId],
    );

    const [reviewed] = await em
      .getConnection()
      .execute<Array<{ reviewed: number }>>(
        `select count(*)::int as reviewed
         from "card_review" r
         join "flash_card" c on c."id" = r."card_id"
        where r."user_id" = ?
          and c."deck_id" = ?
          and r."reviewed_at" >= now() - interval '24 hours'`,
        [userId, deckId],
      );

    return {
      total: Number(counts?.total ?? 0),
      active: Number(counts?.active ?? 0),
      draft: Number(counts?.draft ?? 0),
      archived: Number(counts?.archived ?? 0),
      due: Number(counts?.due ?? 0),
      newCards: Number(counts?.new_cards ?? 0),
      learned: Number(counts?.learned ?? 0),
      learning: Number(counts?.learning ?? 0),
      reviewedInLastDay: Number(reviewed?.reviewed ?? 0),
    };
  }

  /**
   * Malformed ids are answered as "not found" rather than passed to the
   * database, where a non-uuid would raise a cast error and surface as a 500.
   * Both missing and not-yours are 404 as well, so nothing can be probed.
   */
  private async findOwnedDeck(
    em: EntityManager,
    userId: string,
    deckId: string,
  ): Promise<Deck> {
    if (!isUuid(deckId)) throw new NotFoundException("Deck not found.");

    const deck = await em.findOne(Deck, { id: deckId, user: userId });
    if (!deck) throw new NotFoundException("Deck not found.");

    return deck;
  }

  private async findOwnedCard(
    em: EntityManager,
    userId: string,
    cardId: string,
  ): Promise<FlashCard> {
    if (!isUuid(cardId)) throw new NotFoundException("Card not found.");

    // Ownership is on the deck, so the card is fetched with its deck populated
    // and the owner checked through the relation.
    const card = await em.findOne(
      FlashCard,
      { id: cardId, deck: { user: userId } },
      { populate: ["deck"] },
    );

    if (!card) throw new NotFoundException("Card not found.");

    return card;
  }
}

/** Shifts a `YYYY-MM-DD` date by whole days, in UTC so it cannot be affected by
 *  the server's own timezone. */
function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
