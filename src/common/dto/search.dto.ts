import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class SearchDTO {
  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @IsString()
  q?: string;
}
