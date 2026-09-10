import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { Queue } from "bullmq";
import { MAIL_QUEUE_NAME } from "@/infra/mail-queue/mail-queue.constants";
import {
  ACCOUNT_QUEUE_NAME,
  GENERATION_QUEUE_NAME,
  MAINTENANCE_QUEUE_NAME,
} from "@/infra/queue/queue.constants";

/**
 * The four queues, from the API process's side.
 *
 * A queue's depth is not its health: a backlog of waiting jobs is the system
 * working, and failed jobs are a fact about the jobs rather than about the
 * infrastructure. So what this asserts is that Redis answers `getJobCounts` for
 * every queue — that the connection is there and the queue names still exist —
 * and reports the counts as data for whoever is reading the endpoint.
 *
 * It is also the check that would have caught the worker being pointed at a
 * different Redis: the API would enqueue happily into a database nothing
 * consumes from, and every other signal would look fine.
 */
@Injectable()
export class QueueHealthIndicator {
  constructor(
    @InjectQueue(ACCOUNT_QUEUE_NAME) private readonly account: Queue,
    @InjectQueue(GENERATION_QUEUE_NAME) private readonly generation: Queue,
    @InjectQueue(MAINTENANCE_QUEUE_NAME) private readonly maintenance: Queue,
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mail: Queue,
    private readonly indicators: HealthIndicatorService,
  ) {}

  check(key: string, timeoutMs: number) {
    return this.indicators
      .check(key)
      .attempt(async () => {
        const queues = [
          this.account,
          this.generation,
          this.maintenance,
          this.mail,
        ];

        const counts = await Promise.all(
          queues.map((queue) =>
            queue.getJobCounts("waiting", "active", "failed", "delayed"),
          ),
        );

        return {
          depth: Object.fromEntries(
            queues.map((queue, index) => [queue.name, counts[index]]),
          ),
        };
      })
      .withTimeout(timeoutMs);
  }
}
