import { CursorPaginationQueryDTO } from "@/common/dto";
import { GENERATION_JOB_STATUS } from "@/common/constant/enums/generation-job-status.enum";
import { GENERATION_DEFAULTS } from "@/common/constant/generation.constant";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class CreateGenerationJobDTO {
  @ApiProperty({
    description: "The source whose extracted text the cards are written from.",
    format: "uuid",
  })
  @IsUUID()
  sourceId!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: GENERATION_DEFAULTS.MAX_CARDS,
    default: GENERATION_DEFAULTS.MAX_CARDS,
    description:
      "Upper bound on cards produced. A cap, not a target — a source with little to say yields fewer.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(GENERATION_DEFAULTS.MAX_CARDS)
  maxCards?: number;
}

export class GenerationJobListDTO extends CursorPaginationQueryDTO {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  deckId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({ enum: Object.values(GENERATION_JOB_STATUS) })
  @IsOptional()
  @IsEnum(GENERATION_JOB_STATUS)
  status?: (typeof GENERATION_JOB_STATUS)[keyof typeof GENERATION_JOB_STATUS];
}

export class GenerationJobResponseDTO {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() sourceId!: string;

  @ApiProperty({ enum: Object.values(GENERATION_JOB_STATUS) })
  status!: (typeof GENERATION_JOB_STATUS)[keyof typeof GENERATION_JOB_STATUS];

  /** Which generator ran. Recorded per job so the output of two providers on the
   *  same source can be compared later. */
  @ApiProperty() provider!: string;
  @ApiProperty({ nullable: true }) model!: string | null;

  @ApiProperty({ nullable: true, description: "The requested cap." })
  cardsRequested!: number | null;
  @ApiProperty({
    description: "Cards actually written. Zero is a valid result.",
  })
  cardsCreated!: number;

  @ApiProperty({ nullable: true, description: "Set when the job failed." })
  error!: string | null;

  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) finishedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(job: {
    id: string;
    status: (typeof GENERATION_JOB_STATUS)[keyof typeof GENERATION_JOB_STATUS];
    provider: string;
    model: string | null | undefined;
    cardsRequested: number | null | undefined;
    cardsCreated: number;
    error: string | null | undefined;
    startedAt: Date | null | undefined;
    finishedAt: Date | null | undefined;
    createdAt: Date;
    updatedAt: Date;
    deck: { id: string };
    source: { id: string };
  }): GenerationJobResponseDTO {
    const dto = new GenerationJobResponseDTO();
    dto.id = job.id;
    dto.deckId = job.deck.id;
    dto.sourceId = job.source.id;
    dto.status = job.status;
    dto.provider = job.provider;
    dto.model = job.model ?? null;
    dto.cardsRequested = job.cardsRequested ?? null;
    dto.cardsCreated = job.cardsCreated;
    dto.error = job.error ?? null;
    dto.startedAt = job.startedAt ?? null;
    dto.finishedAt = job.finishedAt ?? null;
    dto.createdAt = job.createdAt;
    dto.updatedAt = job.updatedAt;
    return dto;
  }
}
