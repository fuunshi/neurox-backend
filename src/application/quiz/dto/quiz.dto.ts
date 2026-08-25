import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  QUIZ_FORMAT,
  type QuizFormat,
} from "@/common/constant/enums/quiz-format.enum";
import { QUIZ_DEFAULTS } from "@/common/constant/quiz.constant";
import type { QuizQuestion } from "../questions";
import type { QuizAttempt } from "@/database/entities/quiz-attempt.entity";
import type { QuizAnswer } from "@/database/entities/quiz-answer.entity";

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export class CreateQuizAttemptDTO {
  @ApiProperty({ enum: Object.values(QUIZ_FORMAT) })
  @IsEnum(QUIZ_FORMAT)
  format!: QuizFormat;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: QUIZ_DEFAULTS.MAX_QUESTIONS,
    description:
      "An upper bound. A deck with fewer cards produces fewer questions, and " +
      "a deck too small for the format produces none.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(QUIZ_DEFAULTS.MAX_QUESTIONS)
  count?: number;
}

export class QuizAnswerInputDTO {
  @ApiProperty({ description: "Which question this answers." })
  @IsInt()
  @Min(0)
  position!: number;

  @ApiProperty({
    nullable: true,
    description: "The chosen option. Null records a skip, and scores zero.",
  })
  @IsOptional()
  @IsString()
  chosen?: string | null;
}

export class SubmitQuizAnswersDTO {
  @ApiProperty({ type: [QuizAnswerInputDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerInputDTO)
  answers!: QuizAnswerInputDTO[];
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

export class QuizQuestionResponseDTO {
  @ApiProperty() position!: number;
  @ApiProperty() cardId!: string;
  @ApiProperty() prompt!: string;
  @ApiProperty({ type: [String] }) options!: string[];

  @ApiPropertyOptional({
    description:
      "The correct option, present only once this question has been answered. " +
      "An unanswered question does not carry its answer, so a client cannot " +
      "read the key ahead of time — and a finished attempt can be reviewed.",
  })
  correct?: string;

  @ApiPropertyOptional({ nullable: true })
  chosen?: string | null;

  @ApiPropertyOptional()
  wasCorrect?: boolean;

  static from(
    question: QuizQuestion,
    answer?: QuizAnswer,
  ): QuizQuestionResponseDTO {
    const dto = new QuizQuestionResponseDTO();

    dto.position = question.position;
    dto.cardId = question.cardId;
    dto.prompt = question.prompt;
    dto.options = question.options;

    // Revealing the answer is tied to having answered, not to the attempt being
    // finished: immediate feedback is most of the value of quizzing, and a
    // half-done attempt should still show what it got right.
    if (answer) {
      dto.correct = question.correct;
      dto.chosen = answer.chosen;
      dto.wasCorrect = answer.correct;
    }

    return dto;
  }
}

export class QuizAttemptResponseDTO {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty({ enum: Object.values(QUIZ_FORMAT) }) format!: QuizFormat;
  @ApiProperty() status!: string;
  @ApiProperty() questionCount!: number;
  @ApiProperty() correctCount!: number;
  @ApiProperty({ type: [QuizQuestionResponseDTO] })
  questions!: QuizQuestionResponseDTO[];
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ nullable: true }) finishedAt!: Date | null;

  static from(
    attempt: QuizAttempt,
    answers: QuizAnswer[] = [],
  ): QuizAttemptResponseDTO {
    const questions = (attempt.questions ?? []) as QuizQuestion[];
    const byPosition = new Map(answers.map((a) => [a.position, a]));

    const dto = new QuizAttemptResponseDTO();

    dto.id = attempt.id;
    dto.deckId = attempt.deck.id;
    dto.format = attempt.format;
    dto.status = attempt.status;
    dto.questionCount = attempt.questionCount;
    dto.correctCount = attempt.correctCount;
    dto.questions = questions.map((question) =>
      QuizQuestionResponseDTO.from(question, byPosition.get(question.position)),
    );
    dto.startedAt = attempt.startedAt;
    dto.finishedAt = attempt.finishedAt ?? null;

    return dto;
  }
}

/** A past attempt, without the paper — history does not need every question. */
export class QuizHistoryItemDTO {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() deckTitle!: string;
  @ApiProperty({ enum: Object.values(QUIZ_FORMAT) }) format!: QuizFormat;
  @ApiProperty() status!: string;
  @ApiProperty() questionCount!: number;
  @ApiProperty() correctCount!: number;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ nullable: true }) finishedAt!: Date | null;

  static from(attempt: QuizAttempt): QuizHistoryItemDTO {
    const dto = new QuizHistoryItemDTO();

    dto.id = attempt.id;
    dto.deckId = attempt.deck.id;
    dto.deckTitle = attempt.deck.title;
    dto.format = attempt.format;
    dto.status = attempt.status;
    dto.questionCount = attempt.questionCount;
    dto.correctCount = attempt.correctCount;
    dto.startedAt = attempt.startedAt;
    dto.finishedAt = attempt.finishedAt ?? null;

    return dto;
  }
}

export class QuizAnswerResultDTO {
  @ApiProperty() position!: number;
  @ApiProperty({ nullable: true }) chosen!: string | null;
  @ApiProperty() correct!: string;
  @ApiProperty() wasCorrect!: boolean;
}

export class QuizProgressResponseDTO {
  @ApiProperty() attemptId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() answered!: number;
  @ApiProperty() questionCount!: number;
  @ApiProperty() correctCount!: number;
  @ApiProperty({ type: [QuizAnswerResultDTO] })
  results!: QuizAnswerResultDTO[];
  @ApiProperty({
    description: "True once every question has been answered.",
  })
  completed!: boolean;
}
