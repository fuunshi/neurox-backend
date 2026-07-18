import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsInt,
  Min,
  IsString,
  Max,
  IsPositive,
} from "class-validator";
import { Type } from "class-transformer";
import { DEFAULT_LIMIT } from "../constant";

export class CursorPaginationQueryDTO {
  @ApiPropertyOptional({ example: "base64cursor" })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = DEFAULT_LIMIT;
}
