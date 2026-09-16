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

  /*
   * Required, and deliberately the only pair here without `@IsOptional()`.
   *
   * That absence is load-bearing rather than an oversight to be tidied away.
   * `ActivitiesService.getActivities` cannot scope its query without a context,
   * so a call carrying neither value must never reach it — before this was
   * understood, the only thing preventing that was these two decorators being
   * missing. The service now refuses such a call in its own right, so this is
   * the second lock rather than the only one. Both are held by
   * `activities-list.dto.spec.ts`.
   */
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
