import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Gauge } from "@prometheus-io/client";
import type { Queue } from "bullmq";
import { MAIL_QUEUE_NAME } from "@/infra/mail-queue/mail-queue.constants";
import {
  ACCOUNT_QUEUE_NAME,
  GENERATION_QUEUE_NAME,
  MAINTENANCE_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import { MetricsService } from "./metrics.service";

/** The states worth watching. Waiting and delayed are backlog, active is work in
 *  flight, failed is what nobody looks at until a reader complains. */
const STATES = ["waiting", "active", "failed", "delayed"] as const;

/**
 * How deep each queue is, sampled when Prometheus asks.
 *
 * A `collect` callback rather than an interval: a gauge refreshed on a timer is
 * a gauge that is stale exactly when something is going wrong, and it costs a
 * Redis round-trip every tick whether or not anyone is looking. This way the
 * cost is one round-trip per scrape and the number is never older than the
 * scrape itself.
 *
 * Separate from `MetricsService` because that service must not know about
 * queues — it is injected into the request path, and the queues are a concern of
 * whatever happens to be running them.
 */
@Injectable()
export class QueueMetricsService {
  constructor(
    metrics: MetricsService,
    @InjectQueue(ACCOUNT_QUEUE_NAME) account: Queue,
    @InjectQueue(GENERATION_QUEUE_NAME) generation: Queue,
    @InjectQueue(MAINTENANCE_QUEUE_NAME) maintenance: Queue,
    @InjectQueue(MAIL_QUEUE_NAME) mail: Queue,
  ) {
    const queues = [account, generation, maintenance, mail];

    new Gauge({
      name: "bullmq_queue_jobs",
      help: "Jobs in each queue, by state, read at scrape time.",
      labelNames: ["queue", "state"] as const,
      registers: [metrics.registry],
      collect: async function (this: Gauge<"queue" | "state">) {
        let counts: Awaited<ReturnType<Queue["getJobCounts"]>>[];

        try {
          counts = await Promise.all(
            queues.map((queue) => queue.getJobCounts(...STATES)),
          );
        } catch {
          // A scrape must not fail because Redis is down. Rejecting here would
          // take the whole exposition with it — every HTTP metric, every process
          // metric — so a Redis blip would read as "Prometheus has no data about
          // this service", which is the opposite of useful at that moment.
          //
          // The series are simply left as they were. If this is the first
          // scrape, they are absent, which reads as unknown rather than as
          // zero — and a false zero is the one answer that would be worse than
          // no data.
          return;
        }

        queues.forEach((queue, index) => {
          for (const state of STATES) {
            this.set({ queue: queue.name, state }, counts[index]?.[state] ?? 0);
          }
        });
      },
    });
  }
}
