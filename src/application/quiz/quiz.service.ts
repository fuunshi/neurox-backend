import { ActivityRecorderService } from "@/application/activities/activity-recorder.service";
import {
  ACTIVITY_TYPES,
  CONTEXT_TYPES,
  ENTITY_TYPES,
} from "@/common/constant/activity";
import { CARD_STATUS, QUIZ_ATTEMPT_STATUS } from "@/common/constant/enums";
import { QUIZ_DEFAULTS } from "@/common/constant/quiz.constant";
import {
  buildPage,
  decodeCursor,
  keysetAfter,
} from "@/common/utils/pagination/cursor.util";
import {
  Deck,
  FlashCard,
  QuizAnswer,
  QuizAttempt,
  User,
} from "@/database/entities";
import { EntityManager, type FilterQuery } from "@mikro-orm/postgresql";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CreateQuizAttemptDTO,
  QuizAttemptResponseDTO,
  QuizHistoryItemDTO,
  QuizProgressResponseDTO,
  SubmitQuizAnswersDTO,
} from "./dto/quiz.dto";
import {
  buildQuestions,
  isCorrect,
  type QuizQuestion,
  type SourceCard,
} from "./questions";
import type { QuizListDTO } from "./dto/quiz-list.dto";

/**
 * Quizzes.
 *
 * ## The one rule worth stating twice
 *
 * Nothing in this service writes to `FlashCard` or `CardReview`. A quiz result
 * is recorded here and nowhere else, so answering badly cannot move a card's
 * schedule — see the note on `QuizAttempt`. That separation is the whole reason
 * a quiz is worth having: it lets a reader find out what they do not know
 * without betting their review intervals on a guess.
 *
 * ## Grading happens here, not on the client
 *
 * The correct answer is never sent for an unanswered question, and the score is
 * computed from the stored paper rather than from whatever the client reports.
 * A quiz whose results the client could dictate would be worth nothing as a
 * record, and this table is meant to be a record.
 */
@Injectable()
export class QuizService {
  constructor(
    private readonly em: EntityManager,
    private readonly activities: ActivityRecorderService,
  ) {}

  /**
   * Sets a quiz on a deck.
   *
   * The paper is built once and stored, so grading later does not depend on a
   * generator that may have changed in between, and a card edited mid-quiz
   * cannot alter the question the reader already answered.
   */
  async startAttempt(
    userId: string,
    deckId: string,
    dto: CreateQuizAttemptDTO,
  ): Promise<QuizAttemptResponseDTO> {
    const deck = await this.findOwnedDeck(userId, deckId);

    // Only ACTIVE cards are quizzable, matching study: a draft is a proposal
    // the reader has not accepted as material yet, and nothing else may ask
    // them to prove they know it.
    const cards = await this.em.find(
      FlashCard,
      { deck: deck.id, status: CARD_STATUS.ACTIVE, deletedAt: null },
      { orderBy: { createdAt: "asc" }, limit: 200 },
    );

    const source: SourceCard[] = cards.map((card) => ({
      id: card.id,
      front: card.front,
      back: card.back,
      hint: card.hint ?? null,
    }));

    const questions = buildQuestions(source, dto.format, {
      count: dto.count ?? QUIZ_DEFAULTS.QUESTIONS,
    });

    if (questions.length === 0) {
      throw new BadRequestException(
        this.explainEmptyQuiz(dto.format, source.length),
      );
    }

    const attempt = this.em.create(QuizAttempt, {
      user: this.em.getReference(User, userId),
      deck,
      format: dto.format,
      status: QUIZ_ATTEMPT_STATUS.IN_PROGRESS,
      questionCount: questions.length,
      correctCount: 0,
      questions,
      startedAt: new Date(),
    });

    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.QUIZ_STARTED,
      entityType: ENTITY_TYPES.QUIZ_ATTEMPT,
      entityId: attempt.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      parentEntityType: ENTITY_TYPES.DECK,
      parentEntityId: deck.id,
      data: { format: dto.format, questions: questions.length },
    });

    return QuizAttemptResponseDTO.from(attempt, []);
  }

  /**
   * Records answers, grades them, and finishes the attempt once it is complete.
   *
   * Accepts a batch so a client can submit question by question for immediate
   * feedback, or the whole paper at the end. A position that has already been
   * answered is **ignored rather than overwritten**: the first answer is the one
   * that counts, which makes a retried request harmless instead of a way to
   * keep guessing until the score improves.
   */
  async submitAnswers(
    userId: string,
    attemptId: string,
    dto: SubmitQuizAnswersDTO,
  ): Promise<QuizProgressResponseDTO> {
    const attempt = await this.findOwnedAttempt(userId, attemptId);

    const questions = (attempt.questions ?? []) as QuizQuestion[];
    const byPosition = new Map(questions.map((q) => [q.position, q]));

    const existing = await this.em.find(QuizAnswer, { attempt: attempt.id });
    const answered = new Map(
      existing.map((answer) => [answer.position, answer]),
    );

    for (const input of dto.answers) {
      const question = byPosition.get(input.position);

      // An unknown position is dropped rather than rejected: a client sending
      // a stale paper should not be able to fail the whole submission, and
      // there is nothing here it could gain by inventing one.
      if (!question || answered.has(input.position)) continue;

      const chosen = input.chosen ?? null;

      const answer = this.em.create(QuizAnswer, {
        attempt,
        user: this.em.getReference(User, userId),
        card: this.em.getReference(FlashCard, question.cardId),
        position: input.position,
        chosen,
        correct: isCorrect(chosen, question.correct),
      });

      answered.set(input.position, answer);
    }

    const all = [...answered.values()].sort((a, b) => a.position - b.position);
    const correctCount = all.filter((answer) => answer.correct).length;

    attempt.correctCount = correctCount;

    const completed = all.length >= attempt.questionCount;
    const wasAlreadyComplete = attempt.status === QUIZ_ATTEMPT_STATUS.COMPLETED;

    if (completed && !wasAlreadyComplete) {
      attempt.status = QUIZ_ATTEMPT_STATUS.COMPLETED;
      attempt.finishedAt = new Date();
    }

    await this.em.flush();

    // Recorded after the flush so a failed write cannot leave an activity
    // claiming a quiz was finished that was not. `record` swallows its own
    // errors, like every other best-effort side effect in this codebase.
    if (completed && !wasAlreadyComplete) {
      await this.activities.record({
        type: ACTIVITY_TYPES.QUIZ_COMPLETED,
        entityType: ENTITY_TYPES.QUIZ_ATTEMPT,
        entityId: attempt.id,
        actorId: userId,
        contextType: CONTEXT_TYPES.USER,
        contextId: userId,
        parentEntityType: ENTITY_TYPES.DECK,
        parentEntityId: attempt.deck.id,
        data: {
          format: attempt.format,
          correct: correctCount,
          questions: attempt.questionCount,
        },
      });
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      answered: all.length,
      questionCount: attempt.questionCount,
      correctCount,
      completed,
      results: all.map((answer) => ({
        position: answer.position,
        chosen: answer.chosen ?? null,
        correct: byPosition.get(answer.position)?.correct ?? "",
        wasCorrect: answer.correct,
      })),
    };
  }

  /** A past or in-flight attempt, with whatever has been answered so far. */
  async getAttempt(
    userId: string,
    attemptId: string,
  ): Promise<QuizAttemptResponseDTO> {
    const attempt = await this.findOwnedAttempt(userId, attemptId);
    const answers = await this.em.find(QuizAnswer, { attempt: attempt.id });

    return QuizAttemptResponseDTO.from(attempt, answers);
  }

  /**
   * Past attempts, newest first. The paper is omitted — history does not need
   * every question, and a page of them would be a large response for a list.
   *
   * Ordered by `createdAt` rather than `startedAt`: both are set when the row
   * is created, so they are the same instant, and `createdAt` is the column the
   * shared keyset helper knows how to resume from.
   */
  async listAttempts(userId: string, dto: QuizListDTO) {
    const where: FilterQuery<QuizAttempt> = {
      user: userId,
      ...(dto.deckId ? { deck: dto.deckId } : {}),
      ...keysetAfter(decodeCursor(dto.cursor)),
    };

    const rows = await this.em.find(QuizAttempt, where, {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: dto.limit + 1,
      populate: ["deck"],
    });

    const page = buildPage(rows, dto.limit);

    return {
      data: page.data.map((attempt) => QuizHistoryItemDTO.from(attempt)),
      pagination: page.pagination,
    };
  }

  /**
   * Why a quiz came back empty, phrased for the reader rather than the log.
   *
   * The two ways this happens need different answers — "you have no cards" and
   * "this deck is too small for this format" are different problems — and a
   * single "cannot generate quiz" would leave the reader guessing which.
   */
  private explainEmptyQuiz(format: string, cardCount: number): string {
    if (cardCount === 0) {
      return "This deck has no active cards to quiz you on yet.";
    }

    if (format === "MATCHING") {
      return "Matching needs at least two cards with different answers. This deck has fewer.";
    }

    return `This format needs more than one card to offer you a choice. This deck has ${cardCount}.`;
  }

  private async findOwnedDeck(userId: string, deckId: string): Promise<Deck> {
    const deck = await this.em.findOne(Deck, { id: deckId, user: userId });

    if (!deck) throw new NotFoundException("That deck does not exist.");

    return deck;
  }

  private async findOwnedAttempt(
    userId: string,
    attemptId: string,
  ): Promise<QuizAttempt> {
    const attempt = await this.em.findOne(
      QuizAttempt,
      { id: attemptId, user: userId },
      { populate: ["deck"] },
    );

    if (!attempt) throw new NotFoundException("That quiz does not exist.");

    return attempt;
  }
}
