import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
// Typed explicitly rather than inferred. `createChannel`'s `setup` callback
// arrives as `any` through the dynamic import below, and an untyped channel is
// where every `assertQueue` typo becomes a runtime error instead of a
// compile-time one.
import type { Channel, ConsumeMessage } from "amqplib";
import type {
  BrainAnalysis,
  BrainHealth,
  BrainJobResult,
  BrainOptions,
} from "./neurox-brain.types";

/** Body sent to `/analyse`, in the service's own snake_case convention. */
interface AnalyseBody {
  text: string;
  title?: string | null;
  options: {
    max_cards?: number;
    max_quiz_questions?: number;
    include_cloze?: boolean;
    max_keywords?: number;
    max_summary_sentences?: number;
  };
}

/**
 * Talks to `neurox-brain`, over HTTP or a queue.
 *
 * **One interface, two transports.** `analyse()` behaves identically whichever
 * is configured, so the generator above it does not know or care which is in
 * use. That matters because the choice is genuinely a deployment one: a direct
 * call is right when the service is next to the API and the text is small, and
 * a queue is right when it is not.
 *
 * **HTTP is the default and is not a placeholder.** The generator sends one
 * chunk at a time — the same shape the Gemini generator uses, and for the same
 * reasons — and a chunk analyses in roughly 1.5 seconds, so holding a request
 * open is entirely reasonable. The queue exists for the case where it stops
 * being reasonable, not because synchronous calls are embarrassing.
 *
 * **The AMQP path is request/response over a queue**, not fire-and-forget: it
 * publishes with a `reply_to` and waits on a correlation map. That is more
 * machinery than a producer alone, and it is what makes the two transports
 * interchangeable rather than merely both present.
 */
@Injectable()
export class NeuroxBrainClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NeuroxBrainClient.name);

  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  /** Jobs published over the queue and not yet answered. */
  private readonly pending = new Map<
    string,
    {
      resolve: (value: BrainAnalysis) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(private readonly config: ConfigService) {}

  // -- configuration ----------------------------------------------------- //

  private get enabled(): boolean {
    return this.config.get<boolean>("neuroxBrain.enabled") ?? false;
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>("neuroxBrain.baseUrl") ?? "http://localhost:8000"
    );
  }

  private get timeoutMs(): number {
    return this.config.get<number>("neuroxBrain.timeoutMs") ?? 30_000;
  }

  private get transport(): "http" | "amqp" {
    return this.config.get<"http" | "amqp">("neuroxBrain.transport") ?? "http";
  }

  /** Whether the brain is configured for use. Asked by the generator. */
  isEnabled(): boolean {
    return this.enabled;
  }

  // -- lifecycle --------------------------------------------------------- //

  async onModuleInit(): Promise<void> {
    if (!this.enabled || this.transport !== "amqp") return;

    // Imported lazily so an HTTP deployment never loads the AMQP stack, and so
    // a missing optional dependency cannot break start-up for everyone.
    const { connect } = await import("amqp-connection-manager");

    const url = this.config.get<string>("neuroxBrain.amqpUrl") ?? "";
    const resultQueue =
      this.config.get<string>("neuroxBrain.amqpResultQueue") ?? "brain.results";

    this.connection = connect([url], { heartbeatIntervalInSeconds: 10 });
    this.connection.on("connect", () =>
      this.logger.log("neurox-brain AMQP connected."),
    );
    this.connection.on("disconnect", (params) =>
      this.logger.warn(
        `neurox-brain AMQP disconnected: ${params.err?.message ?? "unknown"}`,
      ),
    );

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        // Declared here as well as by the worker, so the API can start first and
        // still receive results. Declaring is idempotent as long as the
        // arguments match, which is why both sides use the same durable flag.
        await channel.assertQueue(resultQueue, { durable: true });
        // One unacknowledged result at a time. Results are small and this
        // process is not the bottleneck; a prefetch higher than the number of
        // pending jobs would only buffer messages nobody is waiting for yet.
        await channel.prefetch(1);
        await channel.consume(resultQueue, (message: ConsumeMessage | null) => {
          this.onResult(message);
        });
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("Shutting down before the brain answered."));
    }
    this.pending.clear();

    await this.connection?.close().catch(() => undefined);
  }

  // -- the one operation that matters ------------------------------------ //

  /**
   * Analyse a document.
   *
   * Throws on any failure — a timeout, a non-2xx, an unreachable service. The
   * caller is a generator inside a queued job, and a job that cannot reach its
   * generator should fail and be retried rather than silently produce nothing.
   */
  async analyse(
    text: string,
    title: string | null,
    options: BrainOptions = {},
  ): Promise<BrainAnalysis> {
    const body: AnalyseBody = {
      text,
      title,
      options: {
        max_cards: options.maxCards,
        max_quiz_questions: options.maxQuizQuestions,
        include_cloze: options.includeCloze,
        max_keywords: options.maxKeywords,
        max_summary_sentences: options.maxSummarySentences,
      },
    };

    return this.transport === "amqp"
      ? this.analyseOverQueue(body)
      : this.analyseOverHttp(body);
  }

  /**
   * The response is returned as it arrives — no renaming.
   *
   * `BrainAnalysis` and its members are written in the service's own snake_case
   * for that reason: `elapsed_ms`, `correct_index`. A mapping layer here would
   * mean the types no longer describe a real payload, and the failure mode of
   * getting one field wrong is an `undefined` at runtime that typechecks
   * perfectly. See the note in `neurox-brain.types.ts`.
   */
  private async analyseOverHttp(body: AnalyseBody): Promise<BrainAnalysis> {
    const response = await fetch(`${this.baseUrl}/analyse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      // `AbortSignal.timeout` rather than a manual timer: it aborts the socket
      // as well as rejecting the promise, so a slow request does not leave a
      // connection held until the server eventually gives up.
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `neurox-brain answered ${response.status}: ${detail.slice(0, 300)}`,
      );
    }

    return (await response.json()) as BrainAnalysis;
  }

  private async analyseOverQueue(body: AnalyseBody): Promise<BrainAnalysis> {
    if (!this.channel) {
      throw new Error(
        "neurox-brain is configured for AMQP but the channel is not ready.",
      );
    }

    const correlationId = randomUUID();
    const replyTo =
      this.config.get<string>("neuroxBrain.amqpResultQueue") ?? "brain.results";

    const answer = new Promise<BrainAnalysis>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(
          new Error(`neurox-brain did not answer within ${this.timeoutMs}ms.`),
        );
      }, this.timeoutMs);

      this.pending.set(correlationId, { resolve, reject, timer });
    });

    await this.channel.sendToQueue(
      this.config.get<string>("neuroxBrain.amqpJobQueue") ?? "brain.jobs",
      {
        // snake_case, because the worker validates this against its own
        // pydantic model. See the note in `neurox-brain.types.ts`.
        job_id: correlationId,
        correlation_id: correlationId,
        reply_to: replyTo,
        text: body.text,
        title: body.title,
        options: body.options,
      },
      // `deliveryMode: 2` is AMQP's "persistent": the broker writes the message
      // to disk before acknowledging, so a restart does not lose a job that was
      // accepted. `persistent: true` reads better but is an amqplib *message*
      // option, not a publish one, and is not accepted here.
      { deliveryMode: 2, correlationId },
    );

    return answer;
  }

  /** Resolves a waiting `analyse()` from a queue message. */
  private onResult(message: ConsumeMessage | null): void {
    if (!message) return;

    let parsed: BrainJobResult;
    try {
      parsed = JSON.parse(message.content.toString("utf8")) as BrainJobResult;
    } catch (error) {
      this.logger.error(
        `Unparseable result from neurox-brain: ${String(error)}`,
      );
      return;
    }

    const key = parsed.correlationId ?? parsed.jobId;
    const waiting = this.pending.get(key);

    // A result nobody is waiting for is normal — the job timed out and the
    // answer arrived late. Dropping it silently is correct; logging loudly is
    // not, because it would fire on every timeout.
    if (!waiting) {
      this.logger.debug(`Discarding a late brain result for ${key}.`);
      return;
    }

    clearTimeout(waiting.timer);
    this.pending.delete(key);

    if (parsed.ok && parsed.result) {
      waiting.resolve(parsed.result);
    } else {
      waiting.reject(
        new Error(parsed.error ?? "neurox-brain reported a failure."),
      );
    }
  }

  // -- health ------------------------------------------------------------ //

  /** The service's health, or null when it cannot be reached. Never throws. */
  async health(): Promise<BrainHealth | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });

      if (!response.ok) return null;
      return (await response.json()) as BrainHealth;
    } catch {
      return null;
    }
  }

  // -- webhook verification ---------------------------------------------- //

  /**
   * Verify a webhook signature, for a caller that receives one.
   *
   * `timingSafeEqual` rather than `===`, because string comparison exits at the
   * first differing byte and the time it takes therefore leaks how much of a
   * guessed signature was right. The lengths are compared first because
   * `timingSafeEqual` throws on a length mismatch rather than returning false.
   *
   * Returns false rather than throwing: every caller's response to a bad
   * signature is the same, and making them all write the same try/catch is how
   * one of them ends up not.
   */
  verifySignature(
    body: Buffer | string,
    signature: string | undefined,
  ): boolean {
    const secret = this.config.get<string>("neuroxBrain.webhookSecret") ?? "";

    if (!secret || !signature) return false;

    const expected = createHmac("sha256", secret)
      .update(typeof body === "string" ? Buffer.from(body, "utf8") : body)
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const providedBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== providedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, providedBuffer);
  }
}
