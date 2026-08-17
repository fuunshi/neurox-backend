import {
  DeckStatsDTO,
  ReviewCardDTO,
  ReviewResponseDTO,
  StudyPoolDTO,
} from "@/application/study/dto/study.dto";
import { StudyService } from "@/application/study/study.service";
import { AuthenticatedRequest } from "@/common/types/request.type";
import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
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
}
