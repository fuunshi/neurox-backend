import { GENERATION_JOB_STATUS } from "@/common/constant/enums/generation-job-status.enum";
import { QUIZ_FORMAT } from "@/common/constant/enums/quiz-format.enum";
import { REVIEW_RATING } from "@/common/constant/enums/review-rating.enum";
import { userTimezone } from "@/common/utils/timezone/user-timezone.util";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import {
  accuracyOf,
  averageSeconds,
  fillHours,
  fillWeekdays,
  rankLeeches,
  rankMissed,
  type SlotRow,
} from "./analytics";
import {
  GenerationAnalyticsDTO,
  QuizAnalyticsDTO,
  ReviewAnalyticsDTO,
} from "./dto/analytics.dto";

/**
 * How far back the series look.
 *
 * The same window the progress overview uses, so two screens showing "the last
 * three months" are showing the same three months.
 */
const WINDOW_DAYS = 90;

/** Attempts and jobs listed for the trend. */
const RECENT_LIMIT = 10;

/** Rows in the "worst first" lists. */
const LIST_LIMIT = 8;

/**
 * How many candidates the ranked lists are chosen from.
 *
 * The ordering rule lives in `analytics.ts` so it can be tested, which means the
 * query has to hand back a superset rather than its own idea of the top eight —
 * but not the whole table. Forty is comfortably more than eight, so a card can
 * only be excluded by it if forty others tie with it on the same count, and in
 * that case the order was arbitrary anyway.
 */
const CANDIDATE_LIMIT = 40;

/**
 * A timestamp from a raw query, as a `Date`.
 *
 * MikroORM's driver hands back the database's own text for a timestamp — it
 * parses them itself on the entity path, but not through `execute()` — so a raw
 * column arrives as `2026-09-20 13:41:08.509+00`. Serialising that as-is would
 * put a format in the response that no `Date.parse` outside Postgres is obliged
 * to understand, so it is converted here rather than left for each client.
 * The offset is always present on a `timestamptz`, which is what makes this
 * unambiguous rather than a guess at the server's zone.
 */
function asDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) return null;

  return value instanceof Date ? value : new Date(value);
}

/**
 * Everything the analytics screens read.
 *
 * Aggregates only, and all of them scoped to the calling reader — these are
 * counts over somebody's own history, so every query carries `user_id` rather
 * than filtering a shared result in code afterwards.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly em: EntityManager) {}

  /**
   * When the reader studies, and what they keep forgetting.
   *
   * Weekdays and hours are bucketed in the reader's own timezone: an 11pm
   * session in Kathmandu is not an 11pm session in UTC, and a "when do you
   * study" chart that quietly used the server's clock would be wrong for
   * everyone who is not sitting next to it.
   */
  async getReviews(userId: string): Promise<ReviewAnalyticsDTO> {
    const timezone = await userTimezone(this.em, userId);

    const [weekdayRows, hourRows, ratingRows, totalsRows, leechRows] =
      await Promise.all([
        this.em.getConnection().execute<SlotRow[]>(
          `select extract(dow from (r."reviewed_at" at time zone ?::text))::int as slot,
                count(*)::int as reviews,
                count(*) filter (where r."rating" <> 'AGAIN')::int as correct
           from "card_review" r
          where r."user_id" = ?
            and r."reviewed_at" >= now() - interval '90 days'
          group by 1`,
          [timezone, userId],
        ),

        this.em.getConnection().execute<SlotRow[]>(
          `select extract(hour from (r."reviewed_at" at time zone ?::text))::int as slot,
                count(*)::int as reviews,
                count(*) filter (where r."rating" <> 'AGAIN')::int as correct
           from "card_review" r
          where r."user_id" = ?
            and r."reviewed_at" >= now() - interval '90 days'
          group by 1`,
          [timezone, userId],
        ),

        this.em
          .getConnection()
          .execute<Array<{ rating: string; count: number }>>(
            `select r."rating" as rating, count(*)::int as count
             from "card_review" r
            where r."user_id" = ?
              and r."reviewed_at" >= now() - interval '90 days'
            group by 1`,
            [userId],
          ),

        // All time, not the window: "how many reviews have I made" is a total,
        // not a recent figure, and a reader with a year of history should not
        // see it reset to whatever the last three months held.
        this.em
          .getConnection()
          .execute<Array<{ reviews: number; days: number; cards: number }>>(
            `select count(*)::int as reviews,
                count(distinct (r."reviewed_at" at time zone ?::text)::date)::int as days,
                count(distinct r."card_id")::int as cards
           from "card_review" r
          where r."user_id" = ?`,
            [timezone, userId],
          ),

        // Cards failed at least twice in the window. One failure is a slip; the
        // list is for cards that keep coming back.
        this.em.getConnection().execute<
          Array<{
            cardId: string;
            front: string;
            lapses: number;
            deckId: string;
            deckTitle: string;
            count: number;
          }>
        >(
          `select c."id" as "cardId",
                c."front" as front,
                c."lapses" as lapses,
                d."id" as "deckId",
                d."title" as "deckTitle",
                count(*)::int as count
           from "card_review" r
           join "flash_card" c on c."id" = r."card_id"
           join "deck" d on d."id" = c."deck_id"
          where r."user_id" = ?
            and r."rating" = 'AGAIN'
            and r."reviewed_at" >= now() - interval '90 days'
            and c."deleted_at" is null
            and d."deleted_at" is null
          group by c."id", c."front", c."lapses", d."id", d."title"
         having count(*) >= 2
          order by count(*) desc
          limit ${CANDIDATE_LIMIT}`,
          [userId],
        ),
      ]);

    const totals = totalsRows[0] ?? { reviews: 0, days: 0, cards: 0 };

    return {
      totals: {
        reviews: Number(totals.reviews),
        days: Number(totals.days),
        cards: Number(totals.cards),
      },
      weekdays: fillWeekdays(weekdayRows),
      hours: fillHours(hourRows),
      ratings: Object.values(REVIEW_RATING).map((rating) => ({
        rating,
        count: Number(
          ratingRows.find((row) => row.rating === rating)?.count ?? 0,
        ),
      })),
      leeches: rankLeeches(
        leechRows.map((row) => ({
          ...row,
          count: Number(row.count),
          lapses: Number(row.lapses),
        })),
        LIST_LIMIT,
      ),
      windowDays: WINDOW_DAYS,
      timezone,
    };
  }

  /**
   * How the reader does on quizzes.
   *
   * Accuracy is correct-over-asked across every attempt, not the mean of each
   * attempt's percentage: averaging percentages would let a two-question quiz
   * move the figure as much as a twenty-question one.
   */
  async getQuizzes(userId: string): Promise<QuizAnalyticsDTO> {
    const [totalsRows, formatRows, recentRows, missedRows] = await Promise.all([
      this.em
        .getConnection()
        .execute<
          Array<{ attempts: number; questions: number; correct: number }>
        >(
          `select count(*)::int as attempts,
              coalesce(sum(a."question_count"), 0)::int as questions,
              coalesce(sum(a."correct_count"), 0)::int as correct
         from "quiz_attempt" a
        where a."user_id" = ?
          and a."status" = 'COMPLETED'`,
          [userId],
        ),

      this.em.getConnection().execute<
        Array<{
          format: string;
          attempts: number;
          questions: number;
          correct: number;
        }>
      >(
        `select a."format" as format,
              count(*)::int as attempts,
              coalesce(sum(a."question_count"), 0)::int as questions,
              coalesce(sum(a."correct_count"), 0)::int as correct
         from "quiz_attempt" a
        where a."user_id" = ?
          and a."status" = 'COMPLETED'
        group by 1`,
        [userId],
      ),

      this.em.getConnection().execute<
        Array<{
          id: string;
          format: string;
          questionCount: number;
          correctCount: number;
          finishedAt: Date | string | null;
          deckId: string;
          deckTitle: string;
        }>
      >(
        `select a."id" as id,
              a."format" as format,
              a."question_count" as "questionCount",
              a."correct_count" as "correctCount",
              a."finished_at" as "finishedAt",
              d."id" as "deckId",
              d."title" as "deckTitle"
         from "quiz_attempt" a
         join "deck" d on d."id" = a."deck_id"
        where a."user_id" = ?
          and a."status" = 'COMPLETED'
          and d."deleted_at" is null
        order by a."finished_at" desc nulls last
        limit ${RECENT_LIMIT}`,
        [userId],
      ),

      // Missed at least once, ranked by how often. An attempt's answers survive
      // the card being archived, so this joins through a left-alive card and
      // drops the ones whose card is gone rather than printing an empty prompt.
      this.em.getConnection().execute<
        Array<{
          cardId: string;
          front: string;
          deckId: string;
          deckTitle: string;
          count: number;
          asked: number;
        }>
      >(
        `select c."id" as "cardId",
              c."front" as front,
              d."id" as "deckId",
              d."title" as "deckTitle",
              count(*) filter (where not qa."correct")::int as count,
              count(*)::int as asked
         from "quiz_answer" qa
         join "quiz_attempt" a on a."id" = qa."attempt_id"
         join "flash_card" c on c."id" = qa."card_id"
         join "deck" d on d."id" = c."deck_id"
        where a."user_id" = ?
          and a."status" = 'COMPLETED'
          and qa."card_id" is not null
          and c."deleted_at" is null
          and d."deleted_at" is null
        group by c."id", c."front", d."id", d."title"
       having count(*) filter (where not qa."correct") > 0
        order by count(*) filter (where not qa."correct") desc
        limit ${CANDIDATE_LIMIT}`,
        [userId],
      ),
    ]);

    const totals = totalsRows[0] ?? { attempts: 0, questions: 0, correct: 0 };
    const questions = Number(totals.questions);
    const correct = Number(totals.correct);

    return {
      totals: {
        attempts: Number(totals.attempts),
        questions,
        correct,
        accuracy: accuracyOf(correct, questions),
      },
      // Every format appears, including the ones never tried: a format missing
      // from the list would read as one that does not exist.
      byFormat: Object.values(QUIZ_FORMAT).map((format) => {
        const row = formatRows.find((entry) => entry.format === format);
        const asked = Number(row?.questions ?? 0);
        const right = Number(row?.correct ?? 0);

        return {
          format,
          attempts: Number(row?.attempts ?? 0),
          questions: asked,
          correct: right,
          accuracy: accuracyOf(right, asked),
        };
      }),
      recent: recentRows.map((row) => ({
        id: row.id,
        deckId: row.deckId,
        deckTitle: row.deckTitle,
        format: row.format as QuizAnalyticsDTO["recent"][number]["format"],
        questionCount: Number(row.questionCount),
        correctCount: Number(row.correctCount),
        accuracy: accuracyOf(
          Number(row.correctCount),
          Number(row.questionCount),
        ),
        finishedAt: asDate(row.finishedAt),
      })),
      missed: rankMissed(
        missedRows.map((row) => ({
          ...row,
          count: Number(row.count),
          asked: Number(row.asked),
        })),
        LIST_LIMIT,
      ),
    };
  }

  /**
   * What the pipeline has actually produced.
   *
   * Separate from the study statistics on purpose: this measures the machine
   * rather than the reader. A source that yields nothing is a fact about the
   * material, and it is worth knowing before uploading three more like it.
   */
  async getGeneration(userId: string): Promise<GenerationAnalyticsDTO> {
    const [statusRows, durationRows, providerRows, sourceRows, recentRows] =
      await Promise.all([
        this.em
          .getConnection()
          .execute<
            Array<{ status: string; jobs: number; cardsCreated: number }>
          >(
            `select j."status" as status,
                count(*)::int as jobs,
                coalesce(sum(j."cards_created"), 0)::int as "cardsCreated"
           from "generation_job" j
          where j."user_id" = ?
            and j."deleted_at" is null
          group by 1`,
            [userId],
          ),

        // Succeeded only, and only where both ends are stamped: a job still
        // running has no duration yet, and dividing in a null would be a lie
        // about how long generation takes.
        this.em.getConnection().execute<Array<{ seconds: number }>>(
          `select extract(epoch from (j."finished_at" - j."started_at"))::float8 as seconds
             from "generation_job" j
            where j."user_id" = ?
              and j."deleted_at" is null
              and j."status" = 'SUCCEEDED'
              and j."started_at" is not null
              and j."finished_at" is not null`,
          [userId],
        ),

        this.em
          .getConnection()
          .execute<
            Array<{ provider: string; jobs: number; cardsCreated: number }>
          >(
            `select j."provider" as provider,
                count(*)::int as jobs,
                coalesce(sum(j."cards_created"), 0)::int as "cardsCreated"
           from "generation_job" j
          where j."user_id" = ?
            and j."deleted_at" is null
          group by 1
          order by "cardsCreated" desc`,
            [userId],
          ),

        this.em.getConnection().execute<
          Array<{
            sourceId: string;
            title: string;
            jobs: number;
            cardsCreated: number;
            failed: number;
          }>
        >(
          `select s."id" as "sourceId",
                s."title" as title,
                count(*)::int as jobs,
                coalesce(sum(j."cards_created"), 0)::int as "cardsCreated",
                count(*) filter (where j."status" = 'FAILED')::int as failed
           from "generation_job" j
           join "source" s on s."id" = j."source_id"
          where j."user_id" = ?
            and j."deleted_at" is null
            and s."deleted_at" is null
          group by s."id", s."title"
          order by "cardsCreated" desc
          limit 12`,
          [userId],
        ),

        this.em.getConnection().execute<
          Array<{
            id: string;
            status: string;
            cardsCreated: number;
            error: string | null;
            finishedAt: Date | string | null;
            seconds: number | null;
            sourceTitle: string | null;
            deckTitle: string | null;
          }>
        >(
          `select j."id" as id,
                j."status" as status,
                j."cards_created" as "cardsCreated",
                j."error" as error,
                j."finished_at" as "finishedAt",
                extract(epoch from (j."finished_at" - j."started_at"))::float8 as seconds,
                s."title" as "sourceTitle",
                d."title" as "deckTitle"
           from "generation_job" j
           left join "source" s on s."id" = j."source_id"
           left join "deck" d on d."id" = j."deck_id"
          where j."user_id" = ?
            and j."deleted_at" is null
          order by j."created_at" desc
          limit ${RECENT_LIMIT}`,
          [userId],
        ),
      ]);

    const jobsFor = (status: string): number =>
      Number(statusRows.find((row) => row.status === status)?.jobs ?? 0);

    return {
      totals: {
        jobs: statusRows.reduce((sum, row) => sum + Number(row.jobs), 0),
        succeeded: jobsFor(GENERATION_JOB_STATUS.SUCCEEDED),
        failed: jobsFor(GENERATION_JOB_STATUS.FAILED),
        inFlight:
          jobsFor(GENERATION_JOB_STATUS.PENDING) +
          jobsFor(GENERATION_JOB_STATUS.RUNNING),
        cardsCreated: statusRows.reduce(
          (sum, row) => sum + Number(row.cardsCreated),
          0,
        ),
        averageSeconds: averageSeconds(
          durationRows.map((row) => Number(row.seconds)),
        ),
      },
      byProvider: providerRows.map((row) => ({
        provider: row.provider,
        jobs: Number(row.jobs),
        cardsCreated: Number(row.cardsCreated),
      })),
      bySource: sourceRows.map((row) => ({
        sourceId: row.sourceId,
        title: row.title,
        jobs: Number(row.jobs),
        cardsCreated: Number(row.cardsCreated),
        failed: Number(row.failed),
      })),
      recent: recentRows.map((row) => ({
        id: row.id,
        sourceTitle: row.sourceTitle,
        deckTitle: row.deckTitle,
        status:
          row.status as GenerationAnalyticsDTO["recent"][number]["status"],
        cardsCreated: Number(row.cardsCreated),
        seconds:
          row.seconds === null || row.seconds === undefined
            ? null
            : Number(row.seconds),
        error: row.error,
        finishedAt: asDate(row.finishedAt),
      })),
    };
  }
}
