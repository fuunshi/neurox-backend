import { CARD_STATUS } from "@/common/constant/enums";
import { CursorPaginationQueryDTO } from "@/common/dto";
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

export class CardResponseDTO {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() front!: string;
  @ApiProperty() back!: string;
  @ApiProperty({ nullable: true }) hint!: string | null;
  @ApiProperty({ enum: Object.values(CARD_STATUS) })
  status!: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
  @ApiProperty({ nullable: true }) generationJobId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(card: {
    id: string;
    front: string;
    back: string;
    hint: string | null | undefined;
    status: (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
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
    dto.createdAt = card.createdAt;
    dto.updatedAt = card.updatedAt;
    return dto;
  }
}
