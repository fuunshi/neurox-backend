import { CURRICULUM_KIND, CurriculumKind } from "@/common/constant/enums";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * One node of the syllabus tree.
 *
 * The tree is returned **flat**, with `parentPath` rather than nested
 * `children`. Every consumer needs a different slice of it — the sitemap wants
 * every path, the breadcrumb wants one ancestor chain, a course page wants one
 * level — and a nested shape makes each of them walk a structure to get at
 * what a flat list already indexes by path. It is a few hundred rows for a
 * whole course and it is served from one cache entry.
 */
export class CurriculumNodeDTO {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) parentPath!: string | null;
  @ApiProperty({ enum: Object.values(CURRICULUM_KIND) })
  kind!: CurriculumKind;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, description: "Syllabus code, e.g. BCA 201" })
  code!: string | null;
  @ApiProperty({ description: "Full path from the root, e.g. bca/semester-5" })
  path!: string;
  @ApiProperty() depth!: number;
  @ApiProperty() ordinal!: number;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) seoTitle!: string | null;
  @ApiProperty({ nullable: true }) seoDescription!: string | null;
  @ApiProperty() noindex!: boolean;
  @ApiProperty() updatedAt!: Date;
}

/** One link in a breadcrumb trail. */
export class BreadcrumbDTO {
  @ApiProperty() title!: string;
  @ApiProperty() path!: string;
}

/**
 * A note as it appears in a list.
 *
 * Carries its node's path and title rather than the node object, because every
 * listing is already scoped to a node the caller knows about — repeating the
 * whole taxonomy node per row would be most of the payload.
 */
export class NoteSummaryDTO {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) excerpt!: string | null;
  @ApiProperty({ nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ nullable: true }) readingMinutes!: number | null;
  @ApiProperty() nodePath!: string;
  @ApiProperty() nodeTitle!: string;
  @ApiProperty() updatedAt!: Date;
}

/** A note with its body — the shape the reading page renders. */
export class NoteDetailDTO extends NoteSummaryDTO {
  @ApiProperty({ description: "Markdown. Never HTML — the client renders it." })
  bodyMarkdown!: string;
  @ApiProperty({ nullable: true }) seoTitle!: string | null;
  @ApiProperty({ nullable: true }) seoDescription!: string | null;
  @ApiProperty({ nullable: true }) canonicalUrl!: string | null;
  @ApiProperty() noindex!: boolean;
  @ApiProperty({ type: [BreadcrumbDTO] })
  breadcrumbs!: BreadcrumbDTO[];
}

export class NoteListQueryDTO {
  @ApiPropertyOptional({
    description:
      "Restrict to notes at or below this node path, e.g. bca/semester-5",
  })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
