import { NotificationService } from "@/application/notification/notification.service";
import { GENERATION_QUEUE_NAME } from "@/infra/queue/queue.constants";
import { RealtimeService } from "@/realtime/realtime.service";
import { SERVER_EVENTS } from "@/realtime/realtime.types";
import { topicRoom } from "@/realtime/realtime.topics";
import { GenerationJob } from "@/database/entities";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueEvents } from "bullmq";

/**
 * Turns "that generation run finished" into a socket message and a notification.
 *
 * ## Why this exists in the API process
 *
 * The generation job runs in the **worker**, which serves no HTTP and therefore
 * has no socket to push to. Notifications it wrote would sit unread until the
 * next page load, which is exactly the thing a socket is meant to remove.
 *
 * Rather than build a job queue in the opposite direction, or reach for a
 * Socket.IO Redis adapter, this listens to BullMQ's own event stream: the queue
 * already announces completions over Redis, and `QueueEvents` is the supported
 * way to hear them. So the API learns the moment a run finishes without polling
 * the database and without a second subscription mechanism.
 *
 * ## Everything here is optional
 *
 * The listener is best-effort by construction. If Redis is unreachable it logs
 * and gives up (the app still boots and still serves); if it reconnects, BullMQ
 * resumes the subscription on its own. A generation still finishes, the row is
 * still updated, and the reader still sees it on the next request — this only
 * makes it arrive sooner.
 */
@Injectable()
export class GenerationEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationEventsListener.name);
  private events: QueueEvents | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    const host = this.configService.get<string>("redis.host") ?? "localhost";
    const port = this.configService.get<number>("redis.port") ?? 6379;
    const password = this.configService.get<string>("redis.password");

    try {
      this.events = new QueueEvents(GENERATION_QUEUE_NAME, {
        connection: {
          host,
          port,
          password: password || undefined,
          // The same two settings the queue itself uses; see `queue.module.ts`.
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not subscribe to generation events; live updates are off. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    this.events.on("completed", ({ jobId }) => {
      void this.onFinished(jobId, "SUCCEEDED");
    });

    // A run that failed also has something to say: the reader is waiting on it.
    this.events.on("failed", ({ jobId }) => {
      void this.onFinished(jobId, "FAILED");
    });

    this.events.on("error", (error) => {
      this.logger.warn(`Generation event stream error: ${error.message}`);
    });

    this.logger.log(
      `Listening for generation results on "${GENERATION_QUEUE_NAME}".`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    // Closed on the way out so the process can exit without BullMQ's connection
    // keeping the event loop alive.
    await this.events?.close().catch(() => undefined);
  }

  /**
   * Reads the finished job and tells whoever is watching.
   *
   * The status is taken from the queue rather than from the database row,
   * because a worker that died mid-run leaves the row saying RUNNING — the
   * queue is what actually knows.
   */
  private async onFinished(
    jobId: string | undefined,
    status: "SUCCEEDED" | "FAILED",
  ): Promise<void> {
    if (!jobId) return;

    try {
      // A forked manager: this runs outside any request, and reusing a request's
      // identity map here would leak entities into it.
      const em = this.em.fork();

      const job = await em.findOne(
        GenerationJob,
        { id: jobId },
        // `source` too: the notification names what the cards were drafted from,
        // and an unpopulated relation would silently render the fallback.
        { populate: ["deck", "user", "source"] },
      );

      if (!job) return;

      const payload = {
        jobId: job.id,
        deckId: job.deck.id,
        status,
        cardsCreated: job.cardsCreated ?? null,
      };

      // To the deck's room, so the generation screen stops asking, and to the
      // reader, so a bell in another tab is right without watching anything.
      this.realtime.emitToRoom(
        topicRoom("deck", job.deck.id),
        SERVER_EVENTS.JOB_UPDATED,
        payload,
      );
      this.realtime.emitToUser(job.user.id, SERVER_EVENTS.JOB_UPDATED, payload);

      if (status === "SUCCEEDED") {
        await this.notifications.create(job.user.id, {
          type: "CARDS_GENERATED",
          params: {
            deckId: job.deck.id,
            deckTitle: job.deck.title,
            count: job.cardsCreated ?? 0,
            sourceTitle: job.source?.title ?? null,
          },
        });
      }
    } catch (error) {
      // Never rethrown: this is invoked from an event emitter, where a rejection
      // has nowhere to go and would become an unhandled rejection.
      this.logger.error(
        `Could not announce generation job ${jobId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
