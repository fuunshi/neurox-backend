import { DeckService } from "@/application/deck/deck.service";
import {
  CardListDTO,
  CardResponseDTO,
  CreateCardDTO,
  CreateDeckDTO,
  DeckListDTO,
  DeckResponseDTO,
  UpdateCardDTO,
  UpdateDeckDTO,
} from "@/application/deck/dto/deck.dto";
import { isExportFormat } from "@/application/deck/export";
import { AuthenticatedRequest } from "@/common/types/request.type";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

@ApiTags("Decks")
@ApiBearerAuth()
@Controller()
export class DeckController {
  constructor(private readonly deckService: DeckService) {}

  // ---------------------------------------------------------------------------
  // Decks
  // ---------------------------------------------------------------------------

  @Post("decks")
  @ApiOperation({ summary: "Create a deck" })
  @ApiResponse({ status: 201, type: DeckResponseDTO })
  async createDeck(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDeckDTO,
  ): Promise<DeckResponseDTO> {
    return this.deckService.createDeck(req.authContext.user.id, dto);
  }

  @Get("decks")
  @ApiOperation({ summary: "List your decks" })
  async listDecks(@Req() req: AuthenticatedRequest, @Query() dto: DeckListDTO) {
    return this.deckService.listDecks(req.authContext.user.id, dto);
  }

  @Get("decks/:id/export")
  @ApiOperation({
    summary: "Export a deck as CSV or TSV",
    description:
      "Answers the file itself, not JSON, so a plain link downloads it. Fields " +
      "are quoted per RFC 4180 — card text routinely contains commas, quotes and " +
      "newlines, and an export that shifted its columns would be silent " +
      "corruption of the one thing someone exports because they care about it. " +
      "`?format=tsv` is what Anki's importer prefers.",
  })
  @Header("Cache-Control", "no-store")
  async exportDeck(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("format") format: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // An unknown format falls back to csv rather than erroring: the parameter
    // is a convenience, and a broken link should still produce the file.
    const resolved = isExportFormat(format) ? format : "csv";

    const file = await this.deckService.exportDeck(
      req.authContext.user.id,
      id,
      resolved,
    );

    void reply
      .header("content-type", file.contentType)
      // `filename*` carries the UTF-8 name RFC 5987-style, so a deck titled in
      // Japanese survives the download; the plain `filename` is the fallback.
      .header(
        "content-disposition",
        `attachment; filename="${file.filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .send(file.body);
  }

  @Get("decks/:id")
  @ApiOperation({ summary: "Get one deck" })
  @ApiResponse({ status: 200, type: DeckResponseDTO })
  async getDeck(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<DeckResponseDTO> {
    return this.deckService.getDeck(req.authContext.user.id, id);
  }

  @Patch("decks/:id")
  @ApiOperation({ summary: "Update a deck" })
  @ApiResponse({ status: 200, type: DeckResponseDTO })
  async updateDeck(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateDeckDTO,
  ): Promise<DeckResponseDTO> {
    return this.deckService.updateDeck(req.authContext.user.id, id, dto);
  }

  @Delete("decks/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a deck and its cards" })
  @ApiResponse({ status: 204 })
  async deleteDeck(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    return this.deckService.deleteDeck(req.authContext.user.id, id);
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  @Post("decks/:deckId/cards")
  @ApiOperation({ summary: "Add a card to a deck" })
  @ApiResponse({ status: 201, type: CardResponseDTO })
  async createCard(
    @Req() req: AuthenticatedRequest,
    @Param("deckId") deckId: string,
    @Body() dto: CreateCardDTO,
  ): Promise<CardResponseDTO> {
    return this.deckService.createCard(req.authContext.user.id, deckId, dto);
  }

  @Get("decks/:deckId/cards")
  @ApiOperation({ summary: "List a deck's cards" })
  async listCards(
    @Req() req: AuthenticatedRequest,
    @Param("deckId") deckId: string,
    @Query() dto: CardListDTO,
  ) {
    return this.deckService.listCards(req.authContext.user.id, deckId, dto);
  }

  @Patch("cards/:id")
  @ApiOperation({ summary: "Update a card" })
  @ApiResponse({ status: 200, type: CardResponseDTO })
  async updateCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateCardDTO,
  ): Promise<CardResponseDTO> {
    return this.deckService.updateCard(req.authContext.user.id, id, dto);
  }

  @Delete("cards/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a card" })
  @ApiResponse({ status: 204 })
  async deleteCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    return this.deckService.deleteCard(req.authContext.user.id, id);
  }
}
