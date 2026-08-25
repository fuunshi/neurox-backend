import { FlashCard } from "./flash-card.entity";
import { QuizAttempt } from "./quiz-attempt.entity";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * One answered question.
 *
 * Kept as rows rather than folded into the attempt's score, because the
 * question this table exists to answer is *which cards* someone gets wrong —
 * that is the whole value of quizzing yourself, and a percentage cannot say it.
 * A score is derivable from these rows; the rows are not derivable from a
 * score.
 *
 * `user` is denormalised from the attempt. Ownership is already implied by it,
 * but "how accurate am I over time" is a question about the reader, and
 * reaching through every attempt to ask it would be a join per row — the same
 * reasoning `CardReview` records its own `user` for.
 *
 * There is no `deletedAt` and no soft-delete filter: an answer is a record of
 * something that happened, and hiding one would make the history untrue. This
 * is the same deliberate exception `Activity` and `CardReview` make.
 */
const QuizAnswerSchema = defineEntity({
  name: "QuizAnswer",
  tableName: "quiz_answer",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    attempt: () => p.manyToOne(QuizAttempt).joinColumn("attempt_id"),
    user: () => p.manyToOne(User).joinColumn("user_id"),
    /**
     * The card this question was built from.
     *
     * Nullable so that deleting a card does not delete the history of having
     * been asked about it — the record of the attempt should outlive the
     * material.
     */
    card: () => p.manyToOne(FlashCard).joinColumn("card_id").nullable(),
    /** Where it sat in the paper, so an attempt reads back in order. */
    position: p.integer(),
    /** What the reader chose. Null when the question was skipped. */
    chosen: p.string().nullable(),
    correct: p.boolean().default(false),
    answeredAt: p
      .datetime()
      .fieldName("answered_at")
      .onCreate(() => new Date()),
  },
  indexes: [
    // Lookup for "what did this attempt answer", which reads in order.
    { properties: ["attempt", "position"] },
    { properties: ["user", "answeredAt"] },
    { properties: ["card"] },
  ],
  /*
   * One answer per position per attempt, enforced by the database rather than
   * only by the service. The service already refuses to overwrite an answer —
   * first answer counts — but that is a rule about behaviour, and this is the
   * one about the data: a duplicate would silently double-count in every
   * accuracy figure computed from these rows.
   */
  uniques: [{ properties: ["attempt", "position"] }],
});

export class QuizAnswer extends QuizAnswerSchema.class {}
QuizAnswerSchema.setClass(QuizAnswer);
