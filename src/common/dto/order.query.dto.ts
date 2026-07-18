import { ApiPropertyOptional } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class OrderQueryDTO {
  @ApiPropertyOptional({
    example: "asc",
    description: "Ascending Or Descending Order",
    enum: Prisma.SortOrder,
    default: Prisma.SortOrder.desc,
  })
  @IsEnum(Prisma.SortOrder)
  @IsOptional()
  order!: Prisma.SortOrder;

  constructor(order: Prisma.SortOrder = Prisma.SortOrder.desc) {
    this.order = order;
  }
}
