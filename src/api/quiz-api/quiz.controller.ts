import {
  CreateQuizAttemptDTO,
  QuizAttemptResponseDTO,
  QuizProgressResponseDTO,
  SubmitQuizAnswersDTO,
} from "@/application/quiz/dto/quiz.dto";
import { QuizListDTO } from "@/application/quiz/dto/quiz-list.dto";
import { QuizService } from "@/application/quiz/quiz.service";
import { AuthenticatedRequest } from "@/common/types/request.type";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("Quizzes")
@ApiBearerAuth()
@Controller("quizzes")
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post("decks/:deckId")
  @ApiOperation({
    summary: "Set a quiz on a deck",
    description:
      "Builds a paper from the deck's active cards and stores it. The correct " +
      "answers are not returned for unanswered questions, so the response " +
      "cannot be read as an answer key. Answering writes nothing to the card " +
      "or its review schedule.",
  })
  @ApiResponse({ status: 201, type: QuizAttemptResponseDTO })
  async start(
    @Req() req: AuthenticatedRequest,
    @Param("deckId") deckId: string,
    @Body() dto: CreateQuizAttemptDTO,
  ): Promise<QuizAttemptResponseDTO> {
    return this.quizService.startAttempt(req.authContext.user.id, deckId, dto);
  }

  @Get("attempts")
  @ApiOperation({ summary: "Quiz history, newest first" })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() dto: QuizListDTO,
  ): Promise<unknown> {
    return this.quizService.listAttempts(req.authContext.user.id, dto);
  }

  @Get("attempts/:id")
  @ApiOperation({
    summary: "One attempt, with its questions and answers so far",
    description:
      "Answered questions carry their correct answer and what was chosen; " +
      "unanswered ones carry neither, so an attempt can be reviewed or resumed.",
  })
  @ApiResponse({ status: 200, type: QuizAttemptResponseDTO })
  async get(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<QuizAttemptResponseDTO> {
    return this.quizService.getAttempt(req.authContext.user.id, id);
  }

  @Post("attempts/:id/answers")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Answer one or more questions",
    description:
      "Accepts a batch, so a client may submit per question for immediate " +
      "feedback or the whole paper at the end. A position already answered is " +
      "ignored rather than overwritten, which makes a retry harmless instead " +
      "of a way to keep guessing. The attempt completes itself once every " +
      "question has an answer.",
  })
  @ApiResponse({ status: 200, type: QuizProgressResponseDTO })
  async answer(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: SubmitQuizAnswersDTO,
  ): Promise<QuizProgressResponseDTO> {
    return this.quizService.submitAnswers(req.authContext.user.id, id, dto);
  }
}
