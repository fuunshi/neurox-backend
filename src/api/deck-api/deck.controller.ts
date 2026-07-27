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
import { AuthenticatedRequest } from "@/common/types/request.type";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
