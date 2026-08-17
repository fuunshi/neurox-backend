import { CardResponseDTO } from "@/application/deck/dto/deck.dto";
import { CARD_STATUS } from "@/common/constant/enums";
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
import { DeckStatsDTO, StudyInclude, STUDY_INCLUDE } from "./dto/study.dto";
import { schedule, type SchedulingState } from "./scheduling";

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

  constructor(private readonly em: EntityManager) {}

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

  /** Counts for one deck, for the deck screen and the study header. */
  async getDeckStats(userId: string, deckId: string): Promise<DeckStatsDTO> {
    await this.findOwnedDeck(this.em, userId, deckId);
    return this.statsFor(this.em, userId, deckId);
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
