import { GENERATION_JOB_STATUS } from "@/common/constant/enums/generation-job-status.enum";
import { QUIZ_FORMAT } from "@/common/constant/enums/quiz-format.enum";
import { REVIEW_RATING } from "@/common/constant/enums/review-rating.enum";
import { ApiProperty } from "@nestjs/swagger";

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export class ReviewTotalsDTO {
  @ApiProperty({
    description: "Every review ever recorded, not just the window.",
  })
  reviews!: number;

  @ApiProperty({
    description:
      "Distinct days with at least one review, counted in the reader's timezone.",
  })
  days!: number;

  @ApiProperty({ description: "Distinct cards reviewed at least once." })
  cards!: number;
}

export class WeekdayBucketDTO {
  @ApiProperty({ description: "0 is Sunday, matching the database's `dow`." })
  weekday!: number;

  @ApiProperty() reviews!: number;
  @ApiProperty({ description: "Reviews that were not AGAIN." })
  correct!: number;
}

export class HourBucketDTO {
  @ApiProperty({ description: "0 is midnight, in the reader's own timezone." })
  hour!: number;

  @ApiProperty() reviews!: number;
  @ApiProperty({ description: "Reviews that were not AGAIN." })
  correct!: number;
}

export class RatingCountDTO {
  @ApiProperty({ enum: Object.values(REVIEW_RATING) })
  rating!: (typeof REVIEW_RATING)[keyof typeof REVIEW_RATING];

  @ApiProperty() count!: number;
}

export class LeechDTO {
  @ApiProperty() cardId!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() deckTitle!: string;
  @ApiProperty({ description: "The card's front, trimmed for a list." })
  front!: string;

  @ApiProperty({ description: "Times failed within the window." })
  count!: number;

  @ApiProperty({
    description:
      "The card's own lapse count, which outlives the window — the same fact over a longer history.",
  })
  lapses!: number;
}

export class ReviewAnalyticsDTO {
  @ApiProperty({ type: ReviewTotalsDTO }) totals!: ReviewTotalsDTO;

  @ApiProperty({
    type: [WeekdayBucketDTO],
    description: "Always seven entries, Sunday first, gaps filled with zeros.",
  })
  weekdays!: WeekdayBucketDTO[];

  @ApiProperty({
    type: [HourBucketDTO],
    description: "Always twenty-four entries, midnight first.",
  })
  hours!: HourBucketDTO[];

  @ApiProperty({
    type: [RatingCountDTO],
    description:
      "How the reader grades themselves. AGAIN is the one that costs them the session.",
  })
  ratings!: RatingCountDTO[];

  @ApiProperty({
    type: [LeechDTO],
    description: "The cards failed most often in the window, worst first.",
  })
  leeches!: LeechDTO[];

  @ApiProperty({ description: "Days the series cover." })
  windowDays!: number;

  @ApiProperty({
    description:
      "The timezone the days and hours were bucketed in — the reader's own, from their profile.",
  })
  timezone!: string;
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export class QuizTotalsDTO {
  @ApiProperty({
    description: "Completed attempts only; an abandoned quiz is not a score.",
  })
  attempts!: number;

  @ApiProperty() questions!: number;
  @ApiProperty() correct!: number;

  @ApiProperty({
    nullable: true,
    description:
      "Correct over asked as a fraction, or null when nothing has been answered. Null rather than zero, because 'none right' and 'never tried' are different claims.",
  })
  accuracy!: number | null;
}

export class QuizFormatStatsDTO {
  @ApiProperty({ enum: Object.values(QUIZ_FORMAT) })
  format!: (typeof QUIZ_FORMAT)[keyof typeof QUIZ_FORMAT];

  @ApiProperty() attempts!: number;
  @ApiProperty() questions!: number;
  @ApiProperty() correct!: number;

  @ApiProperty({ nullable: true }) accuracy!: number | null;
}

export class QuizAttemptSummaryDTO {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() deckTitle!: string;

  @ApiProperty({ enum: Object.values(QUIZ_FORMAT) })
  format!: (typeof QUIZ_FORMAT)[keyof typeof QUIZ_FORMAT];

  @ApiProperty() questionCount!: number;
  @ApiProperty() correctCount!: number;

  @ApiProperty({ nullable: true }) accuracy!: number | null;

  @ApiProperty({ nullable: true, type: Date })
  finishedAt!: Date | null;
}

export class MissedCardDTO {
  @ApiProperty() cardId!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() deckTitle!: string;
  @ApiProperty() front!: string;

  @ApiProperty({ description: "Times answered wrongly." })
  count!: number;

  @ApiProperty({ description: "Times asked at all, which breaks ties." })
  asked!: number;
}

export class QuizAnalyticsDTO {
  @ApiProperty({ type: QuizTotalsDTO }) totals!: QuizTotalsDTO;

  @ApiProperty({
    type: [QuizFormatStatsDTO],
    description:
      "One entry per format, including formats never tried — a missing row would read as a format that does not exist rather than one that has not been used.",
  })
  byFormat!: QuizFormatStatsDTO[];

  @ApiProperty({
    type: [QuizAttemptSummaryDTO],
    description: "Newest first, for the trend.",
  })
  recent!: QuizAttemptSummaryDTO[];

  @ApiProperty({ type: [MissedCardDTO] })
  missed!: MissedCardDTO[];
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export class GenerationTotalsDTO {
  @ApiProperty() jobs!: number;
  @ApiProperty() succeeded!: number;
  @ApiProperty() failed!: number;

  @ApiProperty({
    description:
      "Queued or running now — work that has been asked for and not yet finished.",
  })
  inFlight!: number;

  @ApiProperty() cardsCreated!: number;

  @ApiProperty({
    nullable: true,
    description:
      "Mean wall-clock seconds for succeeded jobs, or null when none has finished.",
  })
  averageSeconds!: number | null;
}

export class GenerationProviderDTO {
  @ApiProperty({
    description:
      "`gemini` when a key is configured, otherwise the deterministic `heuristic` extractor.",
  })
  provider!: string;

  @ApiProperty() jobs!: number;
  @ApiProperty() cardsCreated!: number;
}

export class SourceYieldDTO {
  @ApiProperty() sourceId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() jobs!: number;
  @ApiProperty() cardsCreated!: number;

  @ApiProperty({ description: "Jobs that ended in an error." })
  failed!: number;
}

export class GenerationJobSummaryDTO {
  @ApiProperty() id!: string;

  @ApiProperty({ nullable: true })
  sourceTitle!: string | null;

  @ApiProperty({ nullable: true })
  deckTitle!: string | null;

  @ApiProperty({ enum: Object.values(GENERATION_JOB_STATUS) })
  status!: (typeof GENERATION_JOB_STATUS)[keyof typeof GENERATION_JOB_STATUS];

  @ApiProperty() cardsCreated!: number;

  @ApiProperty({
    nullable: true,
    description: "Wall-clock seconds, once it finished.",
  })
  seconds!: number | null;

  @ApiProperty({
    nullable: true,
    description: "The failure, if there was one.",
  })
  error!: string | null;

  @ApiProperty({ nullable: true, type: Date })
  finishedAt!: Date | null;
}

export class GenerationAnalyticsDTO {
  @ApiProperty({ type: GenerationTotalsDTO }) totals!: GenerationTotalsDTO;

  @ApiProperty({ type: [GenerationProviderDTO] })
  byProvider!: GenerationProviderDTO[];

  @ApiProperty({
    type: [SourceYieldDTO],
    description:
      "What each source actually produced, most cards first — a source that yields nothing is worth knowing about before uploading more of the same.",
  })
  bySource!: SourceYieldDTO[];

  @ApiProperty({ type: [GenerationJobSummaryDTO] })
  recent!: GenerationJobSummaryDTO[];
}
