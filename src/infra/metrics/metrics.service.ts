import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "@prometheus-io/client";

/**
 * The metrics registry, and the only place a metric is declared.
 *
 * This lives in `infra/` rather than beside the `/metrics` controller that
 * serves it, because two different layers need it: the controller renders it,
 * and application services increment it. ARCHITECTURE.md's dependency rule is
 * `api → application → infra`, so `infra` is the only place both can reach.
 *
 * ## Cardinality is the thing to be careful about
 *
 * A Prometheus series is a distinct label combination, and every one of them
 * costs memory in the server forever. The HTTP metrics are therefore labelled by
 * **route pattern** (`/decks/:id/study`), never by URL — labelling by URL would
 * mint a new series per deck id and take the scrape down within a week, which is
 * the classic way a metrics endpoint becomes the outage.
 *
 * The counters below are labelled only where the label has a handful of
 * possible values.
 */
@Injectable()
export class MetricsService {
  private readonly reg = new Registry();

  private readonly httpRequests: Counter<"method" | "route" | "status">;
  private readonly httpDuration: Histogram<"method" | "route" | "status">;

  private readonly reviewsGraded: Counter<"rating">;
  private readonly cardsGenerated: Counter<"provider">;
  private readonly quizzesCompleted: Counter<"format">;
  private readonly notificationsCreated: Counter<"type">;

  constructor(private readonly config: ConfigService) {
    // So a scrape of this app is distinguishable from anything else the same
    // Prometheus collects, without needing a per-target relabel rule.
    this.reg.setDefaultLabels({
      app: this.config.get<string>("app.appName") ?? "Neurox",
    });

    // CPU, memory, event-loop lag, GC, active handles, the Node version — the
    // recommended runtime set, which is the whole "process" family. No reason to
    // hand-roll what the official client already exports.
    collectDefaultMetrics({ register: this.reg });

    this.httpRequests = new Counter({
      name: "http_requests_total",
      help: "HTTP requests handled, by route pattern and response status.",
      labelNames: ["method", "route", "status"] as const,
      registers: [this.reg],
    });

    this.httpDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request latency in seconds, by route pattern.",
      labelNames: ["method", "route", "status"] as const,
      // The default buckets are 5ms–10s, which is the right shape for an API and
      // fine-grained where it matters. Stated explicitly so a change is a
      // decision rather than a library upgrade.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.reg],
    });

    this.reviewsGraded = new Counter({
      name: "reviews_graded_total",
      help: "Card reviews recorded, by grade.",
      labelNames: ["rating"] as const,
      registers: [this.reg],
    });

    this.cardsGenerated = new Counter({
      name: "cards_generated_total",
      help: "Cards produced by a generation run, by provider.",
      labelNames: ["provider"] as const,
      registers: [this.reg],
    });

    this.quizzesCompleted = new Counter({
      name: "quizzes_completed_total",
      help: "Quizzes finished, by format.",
      labelNames: ["format"] as const,
      registers: [this.reg],
    });

    this.notificationsCreated = new Counter({
      name: "notifications_created_total",
      help: "Notifications written, by template type.",
      labelNames: ["type"] as const,
      registers: [this.reg],
    });
  }

  /** One finished request. `route` must be the pattern, not the URL. */
  observeHttp(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status: String(status) };

    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  countReview(rating: string): void {
    this.reviewsGraded.inc({ rating });
  }

  countGenerated(provider: string, count: number): void {
    this.cardsGenerated.inc({ provider }, count);
  }

  countQuiz(format: string): void {
    this.quizzesCompleted.inc({ format });
  }

  countNotification(type: string): void {
    this.notificationsCreated.inc({ type });
  }

  /** The exposition text, and the content type Prometheus expects with it. */
  async render(): Promise<{ body: string; contentType: string }> {
    return {
      body: await this.reg.metrics(),
      contentType: this.reg.contentType,
    };
  }

  /**
   * The registry, for a collector that needs to manage its own lifecycle.
   *
   * Deliberately narrow, and here for one caller: `QueueMetricsService` reads
   * queue depths at scrape time, which means owning a `collect` callback. Declare
   * metrics here where you can — this is where the naming and label conventions
   * live, and a metric declared elsewhere escapes them.
   */
  get registry(): Registry {
    return this.reg;
  }
}
