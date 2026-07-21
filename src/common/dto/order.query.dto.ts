import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

/**
 * The sort orders MikroORM accepts for `orderBy`, replacing Prisma's
 * `SortOrder`. Kept to the two lowercase values so `@IsEnum` still rejects
 * anything else (MikroORM's own `QueryOrder` also allows the uppercase and
 * `NULLS FIRST/LAST` variants).
 */
const SORT_ORDER = {
  asc: "asc",
  desc: "desc",
} as const;

type SortOrder = (typeof SORT_ORDER)[keyof typeof SORT_ORDER];

export class OrderQueryDTO {
  @ApiPropertyOptional({
    example: "asc",
    description: "Ascending Or Descending Order",
    enum: SORT_ORDER,
    default: SORT_ORDER.desc,
  })
  @IsEnum(SORT_ORDER)
  @IsOptional()
  order!: SortOrder;

  constructor(order: SortOrder = SORT_ORDER.desc) {
    this.order = order;
  }
}
