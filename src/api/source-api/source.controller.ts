import { SourceService } from "@/application/source/source.service";
import {
  CreateTextSourceDTO,
  SourceDetailResponseDTO,
  SourceListDTO,
  SourceResponseDTO,
} from "@/application/source/dto/source.dto";
import { AuthenticatedRequest } from "@/common/types/request.type";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FastifyRequest } from "fastify";

@ApiTags("Sources")
@ApiBearerAuth()
@Controller("sources")
export class SourceController {
  constructor(private readonly sourceService: SourceService) {}

  @Post("text")
  @ApiOperation({ summary: "Create a source from pasted text" })
  @ApiResponse({ status: 201, type: SourceResponseDTO })
  async createFromText(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTextSourceDTO,
  ): Promise<SourceResponseDTO> {
    return this.sourceService.createFromText(req.authContext.user.id, dto);
  }

  /**
   * Accepts `.txt`, `.md`, `.pdf` and `.docx`.
   *
   * A file that cannot be parsed still returns 201, with `status: FAILED` and
   * `error` set, because the upload itself succeeded.
   */
  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Create a source from an uploaded file" })
  @ApiResponse({ status: 201, type: SourceResponseDTO })
  async upload(
    @Req() req: AuthenticatedRequest & FastifyRequest,
    @Query("title") title?: string,
  ): Promise<SourceResponseDTO> {
    if (typeof req.isMultipart !== "function" || !req.isMultipart()) {
      throw new BadRequestException(
        "Expected a multipart/form-data upload with a `file` field.",
      );
    }

    const part = await req.file();
    if (!part) {
      throw new BadRequestException("No file was provided.");
    }

    const buffer = await part.toBuffer();

    return this.sourceService.createFromUpload(req.authContext.user.id, {
      buffer,
      fileName: part.filename,
      mimeType: part.mimetype,
      title,
    });
  }

  @Get()
  @ApiOperation({ summary: "List your sources" })
  async list(@Req() req: AuthenticatedRequest, @Query() dto: SourceListDTO) {
    return this.sourceService.list(req.authContext.user.id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a source, including its extracted text" })
  @ApiResponse({ status: 200, type: SourceDetailResponseDTO })
  async get(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<SourceDetailResponseDTO> {
    return this.sourceService.get(req.authContext.user.id, id);
  }

  @Get(":id/chunks")
  @ApiOperation({
    summary: "Preview how this source will be chunked for generation",
  })
  async chunks(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sourceService.chunks(req.authContext.user.id, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a source" })
  @ApiResponse({ status: 204 })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    return this.sourceService.delete(req.authContext.user.id, id);
  }
}
