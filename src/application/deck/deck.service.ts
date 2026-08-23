import { ActivityRecorderService } from "@/application/activities/activity-recorder.service";
import {
  ACTIVITY_TYPES,
  CONTEXT_TYPES,
  ENTITY_TYPES,
} from "@/common/constant/activity";
import { CARD_STATUS } from "@/common/constant/enums";
import {
  contentTypeFor,
  delimiterFor,
  exportFilename,
  toDelimited,
  type ExportFormat,
} from "./export";
import { EASE } from "@/application/study/scheduling";
import {
  buildPage,
  decodeCursor,
  keysetAfter,
} from "@/common/utils/pagination/cursor.util";
import { Deck, FlashCard, User } from "@/database/entities";
import { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CardListDTO,
  CardResponseDTO,
  CreateCardDTO,
  CreateDeckDTO,
  DeckListDTO,
  DeckResponseDTO,
  UpdateCardDTO,
  UpdateDeckDTO,
} from "./dto/deck.dto";

@Injectable()
export class DeckService {
  constructor(
    private readonly em: EntityManager,
    private readonly activities: ActivityRecorderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Decks
  // ---------------------------------------------------------------------------

  async createDeck(
    userId: string,
    dto: CreateDeckDTO,
  ): Promise<DeckResponseDTO> {
    const deck = this.em.create(Deck, {
      user: this.em.getReference(User, userId),
      title: dto.title,
      description: dto.description ?? null,
    });
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.DECK_CREATED,
      entityType: ENTITY_TYPES.DECK,
      entityId: deck.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      data: { title: deck.title },
    });

    return DeckResponseDTO.from(deck, 0);
  }

  async listDecks(userId: string, dto: DeckListDTO) {
    const where: FilterQuery<Deck> = {
      user: userId,
      ...keysetAfter(decodeCursor(dto.cursor)),
    };

    const rows = await this.em.find(Deck, where, {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: dto.limit + 1,
    });

    const page = buildPage(rows, dto.limit);
    const counts = await this.cardCounts(page.data.map((d) => d.id));

    return {
      data: page.data.map((deck) =>
        DeckResponseDTO.from(deck, counts.get(deck.id) ?? 0),
      ),
      pagination: page.pagination,
    };
  }

  async getDeck(userId: string, deckId: string): Promise<DeckResponseDTO> {
    const deck = await this.findOwnedDeck(userId, deckId);
    const counts = await this.cardCounts([deck.id]);
    return DeckResponseDTO.from(deck, counts.get(deck.id) ?? 0);
  }

  async updateDeck(
    userId: string,
    deckId: string,
    dto: UpdateDeckDTO,
  ): Promise<DeckResponseDTO> {
    const deck = await this.findOwnedDeck(userId, deckId);

    const before = { title: deck.title, description: deck.description };
    this.em.assign(deck, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
    });
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.DECK_UPDATED,
      entityType: ENTITY_TYPES.DECK,
      entityId: deck.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      data: {
        before,
        after: { title: deck.title, description: deck.description },
      },
    });

    const counts = await this.cardCounts([deck.id]);
    return DeckResponseDTO.from(deck, counts.get(deck.id) ?? 0);
  }

  /**
   * Soft-deletes the deck and its cards together. A card is meaningless without
   * its deck, so leaving them active would make them unreachable but still
   * countable.
   */
  /**
   * Every card in a deck, as text.
   *
   * Loaded through a cursor-free find rather than the paginated list: an export
   * that silently stopped at fifty cards would be worse than no export, because
   * the reader would not know to check.
   */
  async exportDeck(
    userId: string,
    deckId: string,
    format: ExportFormat,
  ): Promise<{ filename: string; body: string; contentType: string }> {
    const deck = await this.findOwnedDeck(userId, deckId);

    const cards = await this.em.find(
      FlashCard,
      { deck: deck.id },
      { orderBy: { createdAt: "asc", id: "asc" } },
    );

    return {
      filename: exportFilename(deck.title, format),
      body: toDelimited(
        cards.map((card) => ({
          front: card.front,
          back: card.back,
          hint: card.hint ?? null,
          status: card.status,
          dueAt: card.dueAt ?? null,
          intervalDays: card.intervalDays,
          lapses: card.lapses,
          createdAt: card.createdAt,
        })),
        delimiterFor(format),
      ),
      contentType: contentTypeFor(format),
    };
  }

  async deleteDeck(userId: string, deckId: string): Promise<void> {
    const deck = await this.findOwnedDeck(userId, deckId);
    const deletedAt = new Date();

    deck.deletedAt = deletedAt;
    await this.em.nativeUpdate(
      FlashCard,
      { deck: deck.id, deletedAt: null },
      { deletedAt },
    );
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.DECK_DELETED,
      entityType: ENTITY_TYPES.DECK,
      entityId: deck.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      data: { title: deck.title },
    });
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  async createCard(
    userId: string,
    deckId: string,
    dto: CreateCardDTO,
  ): Promise<CardResponseDTO> {
    const deck = await this.findOwnedDeck(userId, deckId);

    const card = this.em.create(FlashCard, {
      deck,
      front: dto.front,
      back: dto.back,
      hint: dto.hint ?? null,
      // Cards default to DRAFT so generated and hand-written cards go through
      // the same review step before entering study or quizzes.
      status: dto.status ?? CARD_STATUS.DRAFT,
    });
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.CARD_CREATED,
      entityType: ENTITY_TYPES.FLASH_CARD,
      entityId: card.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      parentEntityType: ENTITY_TYPES.DECK,
      parentEntityId: deck.id,
      data: { front: card.front },
    });

    return CardResponseDTO.from(card);
  }

  async listCards(userId: string, deckId: string, dto: CardListDTO) {
    const deck = await this.findOwnedDeck(userId, deckId);

    const where: FilterQuery<FlashCard> = {
      deck: deck.id,
      ...(dto.status ? { status: dto.status } : {}),
      ...keysetAfter(decodeCursor(dto.cursor)),
    };

    const rows = await this.em.find(FlashCard, where, {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: dto.limit + 1,
    });

    const page = buildPage(rows, dto.limit);
    return {
      data: page.data.map((card) => CardResponseDTO.from(card)),
      pagination: page.pagination,
    };
  }

  async updateCard(
    userId: string,
    cardId: string,
    dto: UpdateCardDTO,
  ): Promise<CardResponseDTO> {
    const card = await this.findOwnedCard(userId, cardId);

    const statusChanged =
      dto.status !== undefined && dto.status !== card.status;

    /**
     * Rewriting what a card asks or answers invalidates its schedule.
     *
     * The intervals were earned by recalling the *old* wording; carrying them
     * over would tell the reader they know something they have never been asked.
     * So the schedule resets and the card becomes new again — which is also the
     * honest outcome, since the next review is genuinely the first one.
     *
     * A status change, a hint or a reorder does not reset anything: the
     * question and the answer are unchanged, which is what was being learned.
     */
    const contentChanged =
      (dto.front !== undefined && dto.front !== card.front) ||
      (dto.back !== undefined && dto.back !== card.back);

    this.em.assign(card, {
      ...(dto.front !== undefined ? { front: dto.front } : {}),
      ...(dto.back !== undefined ? { back: dto.back } : {}),
      ...(dto.hint !== undefined ? { hint: dto.hint } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(contentChanged
        ? {
            dueAt: null,
            intervalDays: 0,
            easeFactor: EASE.DEFAULT,
            repetitions: 0,
            lastReviewedAt: null,
            // `lapses` is deliberately kept: how often a card was forgotten is
            // history, not schedule, and zeroing it would hide the signal that
            // this card keeps failing.
          }
        : {}),
    });
    await this.em.flush();

    await this.activities.record({
      type: statusChanged
        ? ACTIVITY_TYPES.CARD_STATUS_CHANGED
        : ACTIVITY_TYPES.CARD_UPDATED,
      entityType: ENTITY_TYPES.FLASH_CARD,
      entityId: card.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      parentEntityType: ENTITY_TYPES.DECK,
      parentEntityId: card.deck.id,
      data: {
        front: card.front,
        status: card.status,
        ...(contentChanged ? { scheduleReset: true } : {}),
      },
    });

    return CardResponseDTO.from(card);
  }

  async deleteCard(userId: string, cardId: string): Promise<void> {
    const card = await this.findOwnedCard(userId, cardId);
    const deckId = card.deck.id;

    card.deletedAt = new Date();
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.CARD_DELETED,
      entityType: ENTITY_TYPES.FLASH_CARD,
      entityId: card.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      parentEntityType: ENTITY_TYPES.DECK,
      parentEntityId: deckId,
      data: { front: card.front },
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Loads a deck the user owns.
   *
   * Missing and not-yours both surface as 404 on purpose: distinguishing them
   * would let a caller probe for other users' deck ids.
   */
  private async findOwnedDeck(userId: string, deckId: string): Promise<Deck> {
    const deck = await this.em.findOne(Deck, {
      id: deckId,
      user: userId,
    });

    if (!deck) {
      throw new NotFoundException("Deck not found.");
    }

    return deck;
  }

  private async findOwnedCard(
    userId: string,
    cardId: string,
  ): Promise<FlashCard> {
    // Ownership is on the deck, so the card is fetched with its deck populated
    // and the owner checked through the relation.
    const card = await this.em.findOne(
      FlashCard,
      { id: cardId, deck: { user: userId } },
      { populate: ["deck"] },
    );

    if (!card) {
      throw new NotFoundException("Card not found.");
    }

    return card;
  }

  /**
   * Card counts for a page of decks, in one query.
   *
   * Deliberately raw: this is a grouped aggregate across a set of ids, which
   * the entity API would express as one query per deck. The `deleted_at`
   * predicate mirrors the entity's soft-delete filter, which raw SQL bypasses.
   *
   * Note the explicit `in (?, ?, ...)` placeholders. `= any(?)` does not work
   * here: MikroORM routes `execute()` through Kysely, which binds a JS array as
   * a single string literal, and Postgres then rejects it as a malformed array.
   */
  private async cardCounts(deckIds: string[]): Promise<Map<string, number>> {
    if (deckIds.length === 0) return new Map();

    const placeholders = deckIds.map(() => "?").join(", ");
    const rows = await this.em
      .getConnection()
      .execute<{ deck_id: string; count: number }[]>(
        `select "deck_id", count(*)::int as count
           from "flash_card"
          where "deck_id" in (${placeholders}) and "deleted_at" is null
          group by "deck_id"`,
        deckIds,
      );

    return new Map(rows.map((r) => [r.deck_id, Number(r.count)]));
  }
}
