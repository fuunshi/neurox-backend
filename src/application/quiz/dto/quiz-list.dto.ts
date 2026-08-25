import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { CursorPaginationQueryDTO } from "@/common/dto";

/**
 * Filters for quiz history.
 *
 * Scoped to a deck rather than offering a status filter: the question a reader
 * actually asks of this list is "how have I done on this deck", and an
 * in-progress attempt is already distinguishable from a finished one by its
 * status in the response.
 */
export class QuizListDTO extends CursorPaginationQueryDTO {
  @ApiPropertyOptional({ description: "Only attempts on this deck." })
  @IsOptional()
  @IsUUID()
  deckId?: string;
}
