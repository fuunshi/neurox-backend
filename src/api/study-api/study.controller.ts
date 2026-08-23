import { CardImprovementDTO } from "@/application/study/dto/improve.dto";
import {
  DeckStatsDTO,
  ReviewCardDTO,
  ReviewResponseDTO,
  StudyOverviewDTO,
  StudyPoolDTO,
} from "@/application/study/dto/study.dto";
import { StudyService } from "@/application/study/study.service";
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

@ApiTags("Study")
@ApiBearerAuth()
@Controller()
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Get("decks/:deckId/study")
  @ApiOperation({
    summary: "Cards to study now",
    description:
      "Active cards that are due, never-reviewed ones first, plus the deck's " +
      "counts — the study screen needs both, and asking twice would spend two " +
      "of the endpoint's throttled requests. `?include=all` ignores the " +
      "schedule for cramming.",
  })
  async getStudyPool(
    @Req() req: AuthenticatedRequest,
    @Param("deckId") deckId: string,
    @Query() dto: StudyPoolDTO,
  ) {
    return this.studyService.getStudyPool(req.authContext.user.id, deckId, dto);
  }

  @Get("decks/:deckId/stats")
  @ApiOperation({
    summary: "Deck counts",
    description:
      "Totals by status, how many are due, how many are new versus learned, " +
      "and how many reviews this reader made in the last 24 hours.",
  })
  @ApiResponse({ status: 200, type: DeckStatsDTO })
  async getDeckStats(
    @Req() req: AuthenticatedRequest,
    @Param("deckId") deckId: string,
  ): Promise<DeckStatsDTO> {
    return this.studyService.getDeckStats(req.authContext.user.id, deckId);
  }

  @Get("study/overview")
  @ApiOperation({
    summary: "Study statistics across every deck",
    description:
      "A streak, a 30-day review history, retention over that window, and what " +
      "falls due over the next fortnight. Day boundaries are the reader's, taken " +
      "from their profile, so a streak does not reset at the server's midnight.",
  })
  @ApiResponse({ status: 200, type: StudyOverviewDTO })
  async getOverview(
    @Req() req: AuthenticatedRequest,
  ): Promise<StudyOverviewDTO> {
    return this.studyService.getOverview(req.authContext.user.id);
  }

  @Post("cards/:id/review")
  @ApiOperation({
    summary: "Record a review and reschedule the card",
    description:
      "AGAIN returns the card within the session and lowers its ease; HARD, " +
      "GOOD and EASY push it further out, EASY furthest. Returns the interval " +
      "applied, so the screen can say when the card will be back rather than " +
      "leaving the reader to guess.",
  })
  @ApiResponse({ status: 201, type: ReviewResponseDTO })
  async reviewCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: ReviewCardDTO,
  ): Promise<ReviewResponseDTO> {
    return this.studyService.reviewCard(
      req.authContext.user.id,
      id,
      dto.rating,
    );
  }

  @Post("cards/:id/improve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Propose a rewrite of a card you keep forgetting",
    description:
      "Returns a suggestion and the reason for it. Nothing is saved — a card " +
      "forgotten repeatedly is usually a badly written card rather than a hard " +
      "fact, and a silent rewrite would change what the schedule is measuring. " +
      "Accepting it goes through PATCH /cards/:id like any other edit. Needs " +
      "GEMINI_API_KEY; without one this answers 503 and says so.",
  })
  @ApiResponse({ status: 200, type: CardImprovementDTO })
  async improveCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<CardImprovementDTO> {
    return this.studyService.improveCard(req.authContext.user.id, id);
  }

  @Post("cards/:id/review/undo")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reverse the most recent review of a card",
    description:
      "For a mis-clicked grade. Restores the card's previous schedule exactly " +
      "and removes the review. Only the latest review can be undone — undoing an " +
      "older one would leave every review after it describing a schedule that no " +
      "longer exists.",
  })
  @ApiResponse({ status: 200, description: "{ reverted: true, dueAt }" })
  async undoReview(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<{ reverted: true; dueAt: Date | null }> {
    return this.studyService.undoLastReview(req.authContext.user.id, id);
  }
}
