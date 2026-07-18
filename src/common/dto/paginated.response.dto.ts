import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class PaginatedResponseDTO<T> {
  @ApiPropertyOptional({
    description: "Page limit",
    example: 10,
    default: 10,
  })
  @Type(() => Number)
  page!: number;

  @ApiPropertyOptional({
    description: "Page limit",
    example: 10,
    default: 10,
  })
  @Type(() => Number)
  limit!: number;

  @ApiPropertyOptional({
    description: "Total number of items",
    example: 100,
  })
  @Type(() => Number)
  total!: number;

  @ApiPropertyOptional({
    description: "Data containing items of type T",
    isArray: true,
  })
  data!: T[];

  constructor(partial: Partial<PaginatedResponseDTO<T>>) {
    Object.assign(this, partial);
  }
}
