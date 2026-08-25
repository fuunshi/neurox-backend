import { QUIZ_ATTEMPT_STATUS } from "@/common/constant/enums/quiz-attempt-status.enum";
import { QUIZ_FORMAT } from "@/common/constant/enums/quiz-format.enum";
import { Deck } from "./deck.entity";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * One sitting of a quiz: the paper that was set, and how it went.
 *
 * ## Quizzes do not touch the schedule
 *
 * Answering a quiz question writes **nothing** to `FlashCard` or `CardReview`.
 * Only a self-graded review moves the intervals. A wrong guess between four
 * options is a weaker and differently-shaped signal than admitting you forgot —
 * it can be a coin flip on a card you half-know — and feeding guesses into the
 * scheduler would quietly corrupt the one number the whole app depends on.
 *
 * So this table and `CardReview` are siblings that never write to each other.
 * If a quiz result should ever influence scheduling, that belongs behind an
 * explicit action the reader takes ("show me this again sooner"), not as a side
 * effect of pressing a button in a quiz.
 *
 * ## Why the paper is stored
 *
 * `questions` holds the generated questions verbatim rather than being
 * regenerated at grading time. Three reasons: a quiz has to be gradable after a
 * card is edited, distractors have to stay the ones the reader actually saw,
 * and grading must not depend on a generator that may have changed in between.
 * Nothing queries inside it — it is written once and read back whole, which is
 * the same reasoning `CardReview.previousState` uses for being JSON.
 */
const QuizAttemptSchema = defineEntity({
  name: "QuizAttempt",
  tableName: "quiz_attempt",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).joinColumn("user_id"),
    deck: () => p.manyToOne(Deck).joinColumn("deck_id"),
    format: p.enum(() => QUIZ_FORMAT).nativeEnumName("quiz_format"),
    status: p
      .enum(() => QUIZ_ATTEMPT_STATUS)
      .nativeEnumName("quiz_attempt_status")
      .default(QUIZ_ATTEMPT_STATUS.IN_PROGRESS),
    /** Questions set, fixed at creation so a score always has a denominator. */
    questionCount: p.integer().fieldName("question_count").default(0),
    correctCount: p.integer().fieldName("correct_count").default(0),
    questions: p.json().fieldName("questions"),
    startedAt: p
      .datetime()
      .fieldName("started_at")
      .onCreate(() => new Date()),
    finishedAt: p.datetime().fieldName("finished_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .fieldName("updated_at")
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
  indexes: [
    { properties: ["user"] },
    { properties: ["deck"] },
    // History is always read per user, newest first.
    { properties: ["user", "startedAt"] },
  ],
});

export class QuizAttempt extends QuizAttemptSchema.class {}
QuizAttemptSchema.setClass(QuizAttempt);
