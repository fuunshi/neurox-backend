import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import { DEFAULT_LIMIT, DEFAULT_PAGE } from "../constant";

export class PaginationQueryDTO {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit!: number;

  constructor(page: number = DEFAULT_PAGE, limit: number = DEFAULT_LIMIT) {
    this.page = page;
    this.limit = limit;
  }
}
