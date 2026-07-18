import {
  CONTEXT_TYPES,
  ContextType,
  ENTITY_TYPES,
  EntityType,
} from "@/common/constant";
import { CursorPaginationQueryDTO } from "@/common/dto/cursor-paginated-query.dto";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsISO8601, IsOptional, IsString } from "class-validator";

export class ActivitiesListDTO extends CursorPaginationQueryDTO {
  @ApiPropertyOptional({ description: "Entity type", enum: ENTITY_TYPES })
  @IsOptional()
  @IsEnum(ENTITY_TYPES)
  entityType?: EntityType;

  @ApiPropertyOptional({ description: "Entity ID" })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: "Context types", enum: CONTEXT_TYPES })
  @IsEnum(CONTEXT_TYPES)
  contextType!: ContextType;

  @ApiPropertyOptional({ description: "Context ID" })
  @IsString()
  contextId!: string;

  @ApiPropertyOptional({ description: "Actor IDs", type: [String] })
  @IsOptional()
  @IsString({ each: true })
  actorId?: string[];

  @ApiPropertyOptional({ description: "Start date for filtering activities" })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ description: "End date for filtering activities" })
  @IsOptional()
  @IsISO8601()
  until?: string;
}
