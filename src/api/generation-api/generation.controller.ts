import {
  CreateGenerationJobDTO,
  GenerationJobListDTO,
  GenerationJobResponseDTO,
} from "@/application/generation/dto/generation.dto";
import { GenerationService } from "@/application/generation/generation.service";
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

@ApiTags("Generation")
@ApiBearerAuth()
@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------

  @Post("decks/:deckId")
  @ApiOperation({
    summary: "Draft cards for a deck from a source",
    description:
      "Writes a generation job and returns immediately. The cards are produced " +
      "by the worker; poll `GET /generation/jobs/:id` for the outcome. Cards " +
      "arrive as drafts and are never added to a study pile automatically.",
  })
  @ApiResponse({ status: 201, type: GenerationJobResponseDTO })
  async createJob(
    @Req() req: AuthenticatedRequest,
    @Param("deckId") deckId: string,
    @Body() dto: CreateGenerationJobDTO,
  ): Promise<GenerationJobResponseDTO> {
    return this.generationService.createJob(
      req.authContext.user.id,
      deckId,
      dto,
    );
  }

  @Get("jobs")
  @ApiOperation({ summary: "List your generation jobs" })
  async listJobs(
    @Req() req: AuthenticatedRequest,
    @Query() dto: GenerationJobListDTO,
  ) {
    return this.generationService.listJobs(req.authContext.user.id, dto);
  }

  @Get("jobs/:id")
  @ApiOperation({
    summary: "Get one generation job",
    description:
      "`cardsCreated` is only meaningful once `status` is SUCCEEDED; a job that " +
      "found nothing to ask about succeeds with zero cards.",
  })
  @ApiResponse({ status: 200, type: GenerationJobResponseDTO })
  async getJob(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<GenerationJobResponseDTO> {
    return this.generationService.getJob(req.authContext.user.id, id);
  }

  @Post("jobs/:id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel a generation job",
    description:
      "A running job is not interrupted — the work already in flight finishes " +
      "and is then discarded, so no cards are written.",
  })
  @ApiResponse({ status: 200, type: GenerationJobResponseDTO })
  async cancelJob(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<GenerationJobResponseDTO> {
    return this.generationService.cancelJob(req.authContext.user.id, id);
  }
}
