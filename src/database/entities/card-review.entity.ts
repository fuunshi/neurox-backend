import { REVIEW_RATING } from "@/common/constant/enums/review-rating.enum";
import { FlashCard } from "./flash-card.entity";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * One review event: this card, this rating, this moment.
 *
 * Append-only, with no `deletedAt` and no soft-delete filter — the same
 * deliberate exception `Activity` makes. A review is a record of something that
 * happened; editing or hiding one would make the history untrue, and nothing
 * deletes a review individually. The current schedule is denormalised onto
 * `FlashCard`, so this table is for history and analysis, never for reading the
 * next due date.
 *
 * `rating` and the resulting interval are both stored. Keeping only the rating
 * would mean re-deriving the interval from whatever the algorithm says *today*,
 * so a change to the scheduling maths would silently rewrite history.
 */
const CardReviewSchema = defineEntity({
  name: "CardReview",
  tableName: "card_review",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    // Unidirectional on purpose: nothing reads a card's reviews along with the
    // card, and adding the inverse collection would make every card load carry
    // the option of dragging its whole history behind it.
    card: () => p.manyToOne(FlashCard).joinColumn("card_id"),
    /**
     * Denormalised from the card's deck. Ownership is already implied by the
     * card, but "what did I review today" is a question about the reader, and
     * reaching through every card to answer it would be a join per row.
     */
    user: () => p.manyToOne(User).joinColumn("user_id"),
    rating: p.enum(() => REVIEW_RATING).nativeEnumName("review_rating"),
    /** The gap that was in force before this review. */
    intervalBeforeDays: p
      .integer()
      .fieldName("interval_before_days")
      .default(0),
    /** The gap this review produced. */
    intervalAfterDays: p.integer().fieldName("interval_after_days").default(0),
    /** Ease after this review, ×100 — see the note on `FlashCard.easeFactor`. */
    easeAfter: p.integer().fieldName("ease_after").default(250),
    reviewedAt: p
      .datetime()
      .fieldName("reviewed_at")
      .onCreate(() => new Date()),
  },
  indexes: [
    { properties: ["card", "reviewedAt"] },
    { properties: ["user", "reviewedAt"] },
  ],
});

export class CardReview extends CardReviewSchema.class {}
CardReviewSchema.setClass(CardReview);
