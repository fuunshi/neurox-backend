import { ApiProperty } from "@nestjs/swagger";

/**
 * A proposed rewrite. Returned, never applied — the reader decides.
 *
 * `reason` comes back with it because a suggestion without its reasoning is just
 * a different card, and the reader is being asked to judge one.
 */
export class CardImprovementDTO {
  @ApiProperty() front!: string;
  @ApiProperty() back!: string;
  @ApiProperty({ nullable: true }) hint!: string | null;

  @ApiProperty({
    description: "One sentence on what was wrong with the original.",
  })
  reason!: string;

  @ApiProperty({ description: "Which model produced it." })
  model!: string;
}
