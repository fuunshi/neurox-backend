import { ContentService } from "@/application/content/content.service";
import { TaxonomyService } from "@/application/content/taxonomy.service";
import {
  ContentTreeResponseDTO,
  NoteDetailDTO,
  NoteListQueryDTO,
  NoteSummaryDTO,
} from "@/application/content/dto/content.dto";
import { Public, SkipLogging } from "@/common/decorators/auth.decorator";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

/**
 * Public read limits.
 *
 * These override the three global buckets in `throttler.module.ts`, which are
 * sized for a signed-in app: one reader is one browser, and every response
 * needs a session, so a tight per-IP budget costs nothing.
 *
 * **These must stay comfortably above whatever the global buckets are set to.**
 * That is the whole point of them — the global configuration is the app's
 * budget, and this is a public site's. Note that the globals come from
 * `THROTTLE_*` env vars, and `.env` raises them well above the 3/20/100 in
 * `throttler.config.ts`; an override below the configured value would silently
 * make the *public* routes the most tightly limited in the application, which
 * is precisely backwards. The values below clear the code defaults by a wide
 * margin and the raised local ones too.
 *
 * Raising them is safe because of what this controller serves: published
 * content, identical for every caller, cached at the frontend, and read-only.
 * There is nothing here to brute-force and nothing per-reader to leak. They are
 * still finite, so a runaway client is still stopped.
 */
const PUBLIC_READ_LIMITS = {
  short: { limit: 120, ttl: 1_000 },
  medium: { limit: 1_200, ttl: 10_000 },
  long: { limit: 6_000, ttl: 60_000 },
} as const;

/**
 * The public study material: the syllabus tree and the notes on it.
 *
 * Every route here carries the same three decorators, and they belong together:
 *
 * - `@Public()` — no session, because there is no reader to identify. These
 *   rows belong to nobody.
 * - `@SkipLogging()` — these are machine-driven reads. `RequestLogInterceptor`
 *   writes a row per request, which is the right trade for reader traffic and
 *   the wrong one for a crawler: at the limits above it would be millions of
 *   rows a day describing requests nobody made.
 * - `@Throttle(...)` — see above.
 *
 * Keeping all three on one controller rather than scattering them per route
 * means the entire anonymous surface of this application is one file to audit.
 * That is the point of it.
 */
@ApiTags("Content")
@Controller("content")
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Get("tree")
  @Public()
  @SkipLogging()
  @Throttle(PUBLIC_READ_LIMITS)
  @ApiOperation({ summary: "The whole syllabus tree, flat" })
  @ApiOkResponse({ type: ContentTreeResponseDTO })
  async tree(): Promise<ContentTreeResponseDTO> {
    return { data: await this.taxonomy.publicTree() };
  }

  @Get("notes")
  @Public()
  @SkipLogging()
  @Throttle(PUBLIC_READ_LIMITS)
  @ApiOperation({ summary: "Published notes, newest first" })
  @ApiOkResponse({ type: [NoteSummaryDTO] })
  async list(@Query() query: NoteListQueryDTO): Promise<NoteSummaryDTO[]> {
    return this.content.listNotes(query);
  }

  @Get("notes/:slug")
  @Public()
  @SkipLogging()
  @Throttle(PUBLIC_READ_LIMITS)
  @ApiOperation({ summary: "One published note, with its body" })
  @ApiOkResponse({ type: NoteDetailDTO })
  async detail(@Param("slug") slug: string): Promise<NoteDetailDTO> {
    return this.content.getNoteBySlug(slug);
  }
}
