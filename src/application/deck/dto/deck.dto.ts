import { CARD_STATUS } from "@/common/constant/enums";
import { CursorPaginationQueryDTO } from "@/common/dto";
import { EXPORT_FORMAT, type ExportFormat } from "@/application/deck/export";
import { MAX_IMPORT_CHARS } from "@/application/deck/import";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class CreateDeckDTO {
  @ApiProperty({ example: "Spanish verbs", maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ example: "Irregular present-tense verbs" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateDeckDTO {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class DeckListDTO extends CursorPaginationQueryDTO {}

export class DeckResponseDTO {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() cardCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(
    deck: {
      id: string;
      title: string;
      // `undefined` is included because MikroORM types nullable properties as
      // `T | null | undefined`; the response normalises it to `null`.
      description: string | null | undefined;
      createdAt: Date;
      updatedAt: Date;
    },
    cardCount = 0,
  ): DeckResponseDTO {
    const dto = new DeckResponseDTO();
    dto.id = deck.id;
    dto.title = deck.title;
    dto.description = deck.description ?? null;
    dto.cardCount = cardCount;
    dto.createdAt = deck.createdAt;
    dto.updatedAt = deck.updatedAt;
    return dto;
  }
}

export class CreateCardDTO {
  @ApiProperty({ example: "to speak" })
  @IsString()
  @Length(1, 5000)
  front!: string;

  @ApiProperty({ example: "hablar" })
  @IsString()
  @Length(1, 5000)
  back!: string;

  @ApiPropertyOptional({ example: "Regular -ar verb" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hint?: string;

  @ApiPropertyOptional({ enum: Object.values(CARD_STATUS) })
  @IsOptional()
  @IsEnum(CARD_STATUS)
  status?: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
}

export class UpdateCardDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  front?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  back?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hint?: string;

  @ApiPropertyOptional({ enum: Object.values(CARD_STATUS) })
  @IsOptional()
  @IsEnum(CARD_STATUS)
  status?: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
}

export class CardListDTO extends CursorPaginationQueryDTO {
  @ApiPropertyOptional({ enum: Object.values(CARD_STATUS) })
  @IsOptional()
  @IsEnum(CARD_STATUS)
  status?: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
}

export class ImportCardsDTO {
  @ApiProperty({
    description:
      "The document's text, already decoded. Sent as text rather than as a file " +
      "so the parsing rules live in one place on the server and the request stays " +
      "ordinary JSON.",
  })
  @IsString()
  @Length(1, MAX_IMPORT_CHARS)
  content!: string;

  @ApiPropertyOptional({
    enum: Object.values(EXPORT_FORMAT),
    description:
      "Which delimiter to expect. Omitted, it is sniffed from the first line.",
  })
  @IsOptional()
  @IsEnum(EXPORT_FORMAT)
  format?: ExportFormat;
}

export class ImportCardsResponseDTO {
  @ApiProperty() created!: number;

  /** One entry per unusable row, naming its line. Rows that are simply blank
   *  padding are not reported — they are not a mistake. */
  @ApiProperty({ type: [String] })
  errors!: string[];

  /** The cards as created, so the caller can show them without re-reading the
   *  list it is already holding. */
  // A thunk, because this class is declared above `CardResponseDTO`: a direct
  // reference would be evaluated while the module is still initialising and hit
  // the temporal dead zone.
  @ApiProperty({ type: () => [CardResponseDTO] })
  cards!: CardResponseDTO[];
}

export class CardResponseDTO {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() front!: string;
  @ApiProperty() back!: string;
  @ApiProperty({ nullable: true }) hint!: string | null;
  @ApiProperty({ enum: Object.values(CARD_STATUS) })
  status!: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
  @ApiProperty({ nullable: true }) generationJobId!: string | null;

  // Scheduling. Exposed because the reader benefits from it — the review screen
  // can say "back in 3 days", and a card's lapse count is a hint that the card
  // itself needs rewriting rather than more reviewing. `easeFactor` stays
  // internal: it is an implementation detail of the interval, and showing it
  // invites tuning the algorithm instead of the card.
  @ApiProperty({
    nullable: true,
    description: "When this card is next due. Null means never reviewed.",
  })
  dueAt!: Date | null;
  @ApiProperty({ description: "Current gap between reviews, in days." })
  intervalDays!: number;
  @ApiProperty({ description: "Consecutive successful reviews." })
  repetitions!: number;
  @ApiProperty({ description: "How often this card has been forgotten." })
  lapses!: number;
  @ApiProperty({ nullable: true }) lastReviewedAt!: Date | null;

  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(card: {
    id: string;
    front: string;
    back: string;
    hint: string | null | undefined;
    status: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
    dueAt?: Date | null;
    intervalDays?: number;
    repetitions?: number;
    lapses?: number;
    lastReviewedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    deck: { id: string };
    generationJob?: { id: string } | null;
  }): CardResponseDTO {
    const dto = new CardResponseDTO();
    dto.id = card.id;
    dto.deckId = card.deck.id;
    dto.front = card.front;
    dto.back = card.back;
    dto.hint = card.hint ?? null;
    dto.status = card.status;
    dto.generationJobId = card.generationJob?.id ?? null;
    // Defaulted rather than required, so a caller that selects a subset of
    // columns still produces a valid response.
    dto.dueAt = card.dueAt ?? null;
    dto.intervalDays = card.intervalDays ?? 0;
    dto.repetitions = card.repetitions ?? 0;
    dto.lapses = card.lapses ?? 0;
    dto.lastReviewedAt = card.lastReviewedAt ?? null;
    dto.createdAt = card.createdAt;
    dto.updatedAt = card.updatedAt;
    return dto;
  }
}
