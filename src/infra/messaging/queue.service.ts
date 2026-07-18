import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue("example")
    private readonly exampleQueue: Queue,
  ) {}

  async addExampleJob(data: Record<string, unknown>): Promise<void> {
    await this.exampleQueue.add("process-example", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.exampleQueue.getWaitingCount(),
      this.exampleQueue.getActiveCount(),
      this.exampleQueue.getCompletedCount(),
      this.exampleQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
