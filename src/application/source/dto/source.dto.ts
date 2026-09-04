import {
  SOURCE_STATUS,
  SOURCE_TYPE,
  SourceStatus,
  SourceType,
} from "@/common/constant/enums";
import { CursorPaginationQueryDTO } from "@/common/dto";
import { Source } from "@/database/entities";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Length } from "class-validator";

export class CreateTextSourceDTO {
  @ApiProperty({ example: "Chapter 3 — Cell biology" })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiProperty({ example: "Mitosis is the process by which..." })
  @IsString()
  @Length(1, 500_000)
  text!: string;

  @ApiPropertyOptional({
    enum: [SOURCE_TYPE.TEXT, SOURCE_TYPE.MARKDOWN],
    default: SOURCE_TYPE.TEXT,
    description: "Markdown is only a hint; both are stored as plain text.",
  })
  @IsOptional()
  @IsEnum(SOURCE_TYPE)
  type?: SourceType;
}

export class SourceListDTO extends CursorPaginationQueryDTO {
  @ApiPropertyOptional({ enum: Object.values(SOURCE_TYPE) })
  @IsOptional()
  @IsEnum(SOURCE_TYPE)
  type?: SourceType;

  @ApiPropertyOptional({ enum: Object.values(SOURCE_STATUS) })
  @IsOptional()
  @IsEnum(SOURCE_STATUS)
  status?: SourceStatus;
}

export class SourceResponseDTO {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: Object.values(SOURCE_TYPE) }) type!: SourceType;
  @ApiProperty({ enum: Object.values(SOURCE_STATUS) }) status!: SourceStatus;
  @ApiProperty({ nullable: true }) fileName!: string | null;
  @ApiProperty({ nullable: true }) sizeBytes!: number | null;
  @ApiProperty({ description: "Length of the extracted text, in characters" })
  characterCount!: number;
  @ApiProperty({ nullable: true, description: "Set when status is FAILED" })
  error!: string | null;
  @ApiProperty({ description: "First characters of the extracted text" })
  excerpt!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(source: Source, excerptChars: number): SourceResponseDTO {
    const dto = new SourceResponseDTO();
    dto.id = source.id;
    dto.title = source.title;
    dto.type = source.type;
    dto.status = source.status;
    dto.fileName = source.fileName ?? null;
    dto.sizeBytes = source.sizeBytes ?? null;
    dto.characterCount = source.rawText?.length ?? 0;
    dto.error = source.error ?? null;
    dto.excerpt = (source.rawText ?? "").slice(0, excerptChars);
    dto.createdAt = source.createdAt;
    dto.updatedAt = source.updatedAt;
    return dto;
  }
}

export class SourceDetailResponseDTO extends SourceResponseDTO {
  @ApiProperty({ description: "The full extracted text" })
  text!: string;

  static detailFrom(
    source: Source,
    excerptChars: number,
  ): SourceDetailResponseDTO {
    const dto = Object.assign(
      new SourceDetailResponseDTO(),
      SourceResponseDTO.from(source, excerptChars),
    );
    dto.text = source.rawText ?? "";
    return dto;
  }
}
