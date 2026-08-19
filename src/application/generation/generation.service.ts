import { ActivityRecorderService } from "@/application/activities/activity-recorder.service";
import { isUuid } from "@/common/utils/validation/is-uuid.util";
import { ChunkingService } from "@/application/source/chunking.service";
import {
  ACTIVITY_TYPES,
  CONTEXT_TYPES,
  ENTITY_TYPES,
} from "@/common/constant/activity";
import {
  CARD_STATUS,
  GENERATION_JOB_STATUS,
  SOURCE_STATUS,
} from "@/common/constant/enums";
import {
  CARD_PROVIDER,
  GENERATION_DEFAULTS,
} from "@/common/constant/generation.constant";
import {
  buildPage,
  decodeCursor,
  keysetAfter,
} from "@/common/utils/pagination/cursor.util";
import {
  GENERATION_QUEUE_EVENTS,
  GENERATION_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import {
  Deck,
  FlashCard,
  GenerationJob,
  Source,
  User,
} from "@/database/entities";
import { InjectQueue } from "@nestjs/bullmq";
import { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import {
  CARD_GENERATORS,
  type CardGenerator,
  GenerationError,
} from "./generators/card-generator.interface";
import {
  CreateGenerationJobDTO,
  GenerationJobListDTO,
  GenerationJobResponseDTO,
} from "./dto/generation.dto";

/**
 * Turns a `Source` into draft cards in a `Deck`.
 *
 * Split across two runtimes on purpose. `createJob` runs in the HTTP process and
 * does only what must happen before the response: validate, write the job, hand
 * it to the queue. `processJob` runs in the worker, because a hosted model over
 * thirty chunks takes far longer than a request should, and because a failure
 * halfway through has to be recoverable rather than lost with a dropped
 * connection.
 *
 * Cards are written as `DRAFT` and never as `ACTIVE`. Generated material is a
 * proposal; the reader decides what reaches their study pile.
 *
 * **On EntityManager scope.** The HTTP methods use the injected `EntityManager`,
 * which Nest's MikroORM integration binds to the request. The worker has no
 * request, and MikroORM v7 refuses context-specific actions on the global
 * manager — so every worker-side method takes a *forked* manager. That is not
 * ceremony: without it the worker dies with "Using global EntityManager instance
 * methods for context specific actions is disallowed", which is exactly the
 * trap the architecture notes warn about for worker-only code.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(CARD_GENERATORS) private readonly generators: CardGenerator[],
    private readonly chunking: ChunkingService,
    private readonly activities: ActivityRecorderService,
    @InjectQueue(GENERATION_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // HTTP side
  // ---------------------------------------------------------------------------

  async createJob(
    userId: string,
    deckId: string,
    dto: CreateGenerationJobDTO,
  ): Promise<GenerationJobResponseDTO> {
    const deck = await this.findOwnedDeck(this.em, userId, deckId);
    const source = await this.findOwnedSource(this.em, userId, dto.sourceId);

    // Refusing here rather than in the worker means the reader gets a 400 they
    // can act on, instead of a job that silently fails a moment later.
    if (source.status !== SOURCE_STATUS.READY || !source.rawText) {
      throw new BadRequestException(
        source.status === SOURCE_STATUS.FAILED
          ? "That source could not be read, so there is nothing to generate from."
          : "That source is still being read. Try again in a moment.",
      );
    }

    const generator = this.defaultGenerator();

    const job = this.em.create(GenerationJob, {
      user: this.em.getReference(User, userId),
      deck,
      source,
      status: GENERATION_JOB_STATUS.PENDING,
      // Recorded now, from the generator that will actually run, so provenance
      // is knowable even if the job dies before it starts.
      provider: generator.provider,
      model: null,
      cardsRequested: dto.maxCards ?? GENERATION_DEFAULTS.MAX_CARDS,
      cardsCreated: 0,
    });

    await this.em.flush();

    await this.queue.add(
      GENERATION_QUEUE_EVENTS.GENERATE_CARDS,
      { jobId: job.id },
      {
        // Two attempts, because a hosted model can fail transiently — a timeout,
        // a rate limit — where a bad source cannot. `processJob` is idempotent,
        // so a retry cannot duplicate cards.
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    return GenerationJobResponseDTO.from(job);
  }

  async getJob(
    userId: string,
    jobId: string,
  ): Promise<GenerationJobResponseDTO> {
    const job = await this.findOwnedJob(this.em, userId, jobId);
    return GenerationJobResponseDTO.from(job);
  }

  async listJobs(userId: string, dto: GenerationJobListDTO) {
    const where: FilterQuery<GenerationJob> = {
      user: userId,
      ...(dto.deckId ? { deck: dto.deckId } : {}),
      ...(dto.sourceId ? { source: dto.sourceId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...keysetAfter(decodeCursor(dto.cursor)),
    };

    const rows = await this.em.find(GenerationJob, where, {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: dto.limit + 1,
      populate: ["deck", "source"],
    });

    const page = buildPage(rows, dto.limit);

    return {
      data: page.data.map((job) => GenerationJobResponseDTO.from(job)),
      pagination: page.pagination,
    };
  }

  /**
   * Marks a job cancelled.
   *
   * A `PENDING` job simply never runs. A `RUNNING` one cannot be stopped
   * mid-request, so `processJob` re-reads the status before writing anything and
   * discards its own output — which is why this is allowed on a running job
   * rather than refused.
   */
  async cancelJob(
    userId: string,
    jobId: string,
  ): Promise<GenerationJobResponseDTO> {
    const job = await this.findOwnedJob(this.em, userId, jobId);

    if (
      job.status === GENERATION_JOB_STATUS.SUCCEEDED ||
      job.status === GENERATION_JOB_STATUS.FAILED
    ) {
      throw new ConflictException("That job has already finished.");
    }

    if (job.status !== GENERATION_JOB_STATUS.CANCELLED) {
      job.status = GENERATION_JOB_STATUS.CANCELLED;
      job.finishedAt = new Date();
      await this.em.flush();
    }

    return GenerationJobResponseDTO.from(job);
  }

  // ---------------------------------------------------------------------------
  // Worker side
  // ---------------------------------------------------------------------------

  /**
   * Runs one job. Called by the worker; safe to call twice.
   *
   * Idempotency is not decoration: BullMQ retries, and a retry that re-appended
   * cards would silently double every card the reader is about to review. So a
   * finished job returns immediately, and a re-run soft-deletes whatever a
   * previous attempt wrote before writing again.
   */
  async processJob(jobId: string): Promise<void> {
    const em = this.em.fork();

    const job = await em.findOne(
      GenerationJob,
      { id: jobId },
      { populate: ["deck", "source", "user"] },
    );

    if (!job) {
      // Deleted between enqueue and pickup. Nothing to do, and not an error.
      this.logger.warn(`Generation job ${jobId} no longer exists`);
      return;
    }

    if (
      job.status === GENERATION_JOB_STATUS.SUCCEEDED ||
      job.status === GENERATION_JOB_STATUS.FAILED ||
      job.status === GENERATION_JOB_STATUS.CANCELLED
    ) {
      this.logger.log(
        `Generation job ${job.id} already ${job.status}; skipping`,
      );
      return;
    }

    job.status = GENERATION_JOB_STATUS.RUNNING;
    job.startedAt = new Date();
    job.error = null;
    await em.flush();

    try {
      const cards = await this.writeCards(em, job);

      // Re-read before committing the result: a cancel that arrived while the
      // model was working must win, or the job would report success for work the
      // reader explicitly stopped. A separate fork is used because the identity
      // map would otherwise return the instance already in memory, status and
      // all.
      const current = await this.em
        .fork()
        .findOne(GenerationJob, { id: job.id });

      if (!current || current.status === GENERATION_JOB_STATUS.CANCELLED) {
        await this.softDeleteCards(em, job.id);
        this.logger.log(
          `Generation job ${job.id} was cancelled; result discarded`,
        );
        return;
      }

      job.cardsCreated = cards.length;
      job.status = GENERATION_JOB_STATUS.SUCCEEDED;
      job.finishedAt = new Date();

      // Passed the forked manager so the history entry is written in the same
      // context as the change it describes. Recording is best-effort by design,
      // so it cannot fail the job.
      await this.activities.record(
        {
          type: ACTIVITY_TYPES.CARDS_GENERATED,
          entityType: ENTITY_TYPES.GENERATION_JOB,
          entityId: job.id,
          actorId: job.user.id,
          // `USER` context, because that is the only context the activity feed
          // will currently return for a reader.
          contextType: CONTEXT_TYPES.USER,
          contextId: job.user.id,
          parentEntityType: ENTITY_TYPES.DECK,
          parentEntityId: job.deck.id,
          data: {
            cardsCreated: cards.length,
            provider: job.provider,
            sourceTitle: job.source.title,
          },
        },
        em,
      );

      await em.flush();

      this.logger.log(
        `Generation job ${job.id} produced ${cards.length} draft card(s) via ${job.provider}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      job.status = GENERATION_JOB_STATUS.FAILED;
      job.error = message.slice(0, 2000);
      job.finishedAt = new Date();
      await em.flush();

      this.logger.error(`Generation job ${job.id} failed: ${message}`);

      // Rethrown so BullMQ applies its retry policy. A transient provider
      // failure deserves another attempt; the job's own record already shows the
      // failure while that happens.
      throw error;
    } finally {
      await em.flush().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async writeCards(
    em: EntityManager,
    job: GenerationJob,
  ): Promise<FlashCard[]> {
    const text = job.source.rawText;
    if (!text) {
      throw new GenerationError("That source has no extracted text.");
    }

    const generator = this.generatorFor(job.provider);
    if (!generator.isAvailable()) {
      throw new GenerationError(
        `The ${job.provider} generator is not available in this environment.`,
      );
    }

    // Anything a previous attempt wrote is removed first, so a retry replaces
    // rather than accumulates.
    await this.softDeleteCards(em, job.id);

    const allChunks = this.chunking.chunk(text);
    const chunks = allChunks.slice(0, GENERATION_DEFAULTS.MAX_CHUNKS);
    const maxCards = job.cardsRequested ?? GENERATION_DEFAULTS.MAX_CARDS;

    const result = await generator.generate({
      chunks,
      maxCards,
      sourceTitle: job.source.title,
    });

    job.model = result.model ?? null;

    return result.cards.slice(0, maxCards).map((generated) =>
      em.create(FlashCard, {
        deck: job.deck,
        generationJob: job,
        front: generated.front,
        back: generated.back,
        hint: generated.hint ?? null,
        // Never ACTIVE: a generated card is a proposal until the reader accepts
        // it.
        status: CARD_STATUS.DRAFT,
      }),
    );
  }

  /**
   * Soft delete, matching how the rest of the domain removes cards: the rows
   * survive for audit, and the entity's global filter hides them from every
   * subsequent read.
   */
  private async softDeleteCards(
    em: EntityManager,
    jobId: string,
  ): Promise<void> {
    await em.nativeUpdate(
      FlashCard,
      { generationJob: jobId },
      { deletedAt: new Date() },
    );
  }

  /** The generator a new job should use: a real model when one is configured,
   *  the deterministic fallback otherwise. */
  private defaultGenerator(): CardGenerator {
    const available = this.generators.filter((generator) =>
      generator.isAvailable(),
    );

    if (available.length === 0) {
      throw new ServiceUnavailableException(
        "No card generator is available in this environment.",
      );
    }

    return (
      available.find((g) => g.provider === CARD_PROVIDER.GEMINI) ?? available[0]
    );
  }

  /** The generator recorded on the job, so a job always runs what it claims. */
  private generatorFor(provider: string): CardGenerator {
    const generator = this.generators.find((g) => g.provider === provider);

    if (!generator) {
      throw new GenerationError(`Unknown generator: ${provider}`);
    }

    return generator;
  }

  /**
   * Missing and not-yours both answer 404, so a caller cannot probe for other
   * people's ids.
   */
  private async findOwnedDeck(
    em: EntityManager,
    userId: string,
    deckId: string,
  ): Promise<Deck> {
    const deck = await em.findOne(Deck, { id: deckId, user: userId });

    if (!deck) throw new NotFoundException("Deck not found.");

    return deck;
  }

  private async findOwnedSource(
    em: EntityManager,
    userId: string,
    sourceId: string,
  ): Promise<Source> {
    const source = await em.findOne(Source, { id: sourceId, user: userId });

    if (!source) throw new NotFoundException("Source not found.");

    return source;
  }

  private async findOwnedJob(
    em: EntityManager,
    userId: string,
    jobId: string,
  ): Promise<GenerationJob> {
    const job = await em.findOne(
      GenerationJob,
      { id: jobId, user: userId },
      { populate: ["deck", "source"] },
    );

    if (!job) throw new NotFoundException("Generation job not found.");

    return job;
  }
}
