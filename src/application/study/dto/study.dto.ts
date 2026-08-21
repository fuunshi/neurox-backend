import { CursorPaginationQueryDTO } from "@/common/dto";
import { REVIEW_RATING } from "@/common/constant/enums/review-rating.enum";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

/** What the study pool should contain. */
export const STUDY_INCLUDE = {
  /** Active cards whose time has come, including ones never reviewed. */
  DUE: "due",
  /** Every active card, schedule ignored — for cramming before an exam. */
  ALL: "all",
} as const;

export type StudyInclude = (typeof STUDY_INCLUDE)[keyof typeof STUDY_INCLUDE];

export class ReviewCardDTO {
  @ApiProperty({
    enum: Object.values(REVIEW_RATING),
    description:
      "AGAIN brings the card back within the session; the other three push it further out, EASY furthest.",
  })
  @IsEnum(REVIEW_RATING)
  rating!: (typeof REVIEW_RATING)[keyof typeof REVIEW_RATING];
}

export class StudyPoolDTO extends CursorPaginationQueryDTO {
  @ApiPropertyOptional({
    enum: Object.values(STUDY_INCLUDE),
    default: STUDY_INCLUDE.DUE,
    description:
      "'due' is active cards whose time has come, including ones never reviewed. 'all' ignores the schedule and returns every active card, for cramming.",
  })
  @IsOptional()
  @IsEnum(STUDY_INCLUDE)
  include?: StudyInclude;
}

export class DeckStatsDTO {
  @ApiProperty({ description: "Every card in the deck, whatever its status." })
  total!: number;

  @ApiProperty() active!: number;
  @ApiProperty() draft!: number;
  @ApiProperty() archived!: number;

  @ApiProperty({
    description:
      "Active cards whose time has come, including ones never reviewed.",
  })
  due!: number;

  @ApiProperty({ description: "Active and never reviewed." })
  newCards!: number;

  @ApiProperty({ description: "Active and reviewed at least once." })
  learned!: number;

  @ApiProperty({
    description:
      "In a relearn step — reviewed, failed, and back within the session. Counted in `due` as well, because a card the reader just forgot belongs in the session they are in.",
  })
  learning!: number;

  @ApiProperty({
    description:
      "Reviews by this reader in the last 24 hours. A rolling window rather than 'today', which would depend on whose midnight.",
  })
  reviewedInLastDay!: number;
}

export class ReviewResultDTO {
  @ApiProperty({
    description: "The interval applied, in days. 0 means it returns today.",
  })
  intervalDays!: number;

  @ApiProperty({
    description: "When the card comes back, so the screen can say so.",
  })
  dueAt!: Date;

  @ApiProperty({ description: "Consecutive successful reviews." })
  repetitions!: number;

  @ApiProperty({ description: "How often this card has been forgotten." })
  lapses!: number;
}

export class ReviewResponseDTO {
  @ApiProperty() cardId!: string;
  @ApiProperty() rating!: (typeof REVIEW_RATING)[keyof typeof REVIEW_RATING];
  @ApiProperty({ type: ReviewResultDTO }) scheduling!: ReviewResultDTO;
}

/* -------------------------------------------------------------------------- */
/* Overview — across every deck                                            */
/* -------------------------------------------------------------------------- */

export class ReviewDayDTO {
  @ApiProperty({
    example: "2026-09-24",
    description: "In the reader's timezone.",
  })
  day!: string;

  @ApiProperty() reviews!: number;

  @ApiProperty({ description: "Reviews that were not AGAIN." })
  correct!: number;
}

export class ForecastDayDTO {
  @ApiProperty({ example: "2026-09-25" }) day!: string;
  @ApiProperty() due!: number;
}

export class OverviewTotalsDTO {
  @ApiProperty({ description: "Reviews ever recorded." })
  reviews!: number;

  @ApiProperty({ description: "Active cards across all decks." })
  activeCards!: number;

  @ApiProperty({ description: "Active cards reviewed at least once." })
  learnedCards!: number;

  @ApiProperty({
    nullable: true,
    description:
      "Share of reviews that were not AGAIN, over the window. Null until there is something to divide by — zero would claim the reader remembers nothing.",
  })
  retention!: number | null;

  @ApiProperty({ description: "Cards in play right now, across every deck." })
  dueNow!: number;
}

export class StudyOverviewDTO {
  @ApiProperty({ type: OverviewTotalsDTO }) totals!: OverviewTotalsDTO;

  @ApiProperty({
    description:
      "Days up to today, or the day before, with at least one review.",
  })
  streak!: { current: number; longest: number };

  @ApiProperty({
    type: [ReviewDayDTO],
    description: "One entry per day in the window, including days with none.",
  })
  daily!: ReviewDayDTO[];

  @ApiProperty({
    type: [ForecastDayDTO],
    description: "What is coming due over the next fortnight.",
  })
  forecast!: ForecastDayDTO[];

  @ApiProperty({
    example: "Europe/London",
    description:
      "The timezone every day boundary above was computed in, so the client can label them without guessing.",
  })
  timezone!: string;
}
