import { AnalyticsService } from "@/application/analytics/analytics.service";
import {
  GenerationAnalyticsDTO,
  QuizAnalyticsDTO,
  ReviewAnalyticsDTO,
} from "@/application/analytics/dto/analytics.dto";
import { AuthenticatedRequest } from "@/common/types/request.type";
import { Controller, Get, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("Analytics")
@ApiBearerAuth()
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("reviews")
  @ApiOperation({
    summary: "When you study, and what you keep forgetting",
    description:
      "Reviews bucketed by weekday and by hour in the reader's own timezone, " +
      "how they grade themselves, and the cards failed most often. The two " +
      "series always come back complete — seven and twenty-four entries with " +
      "the empty ones filled — so a chart plots a week rather than the days " +
      "that happen to have reviews in them.",
  })
  @ApiResponse({ status: 200, type: ReviewAnalyticsDTO })
  async getReviews(
    @Req() req: AuthenticatedRequest,
  ): Promise<ReviewAnalyticsDTO> {
    return this.analyticsService.getReviews(req.authContext.user.id);
  }

  @Get("quizzes")
  @ApiOperation({
    summary: "How you do on quizzes",
    description:
      "Accuracy overall and per format, the last few attempts for a trend, " +
      "and the cards missed most. Accuracy is correct over asked, not the mean " +
      "of each attempt's percentage, so a two-question quiz cannot move it as " +
      "much as a twenty-question one — and it is null rather than zero when " +
      "nothing has been answered, because those are different claims.",
  })
  @ApiResponse({ status: 200, type: QuizAnalyticsDTO })
  async getQuizzes(
    @Req() req: AuthenticatedRequest,
  ): Promise<QuizAnalyticsDTO> {
    return this.analyticsService.getQuizzes(req.authContext.user.id);
  }

  @Get("generation")
  @ApiOperation({
    summary: "What your sources actually produced",
    description:
      "Cards created per source, how jobs ended, how long a successful one " +
      "takes, and which provider did the work. This measures the pipeline " +
      "rather than the reader: a source that yields nothing is a fact about " +
      "the material, and worth knowing before uploading more like it.",
  })
  @ApiResponse({ status: 200, type: GenerationAnalyticsDTO })
  async getGeneration(
    @Req() req: AuthenticatedRequest,
  ): Promise<GenerationAnalyticsDTO> {
    return this.analyticsService.getGeneration(req.authContext.user.id);
  }
}
