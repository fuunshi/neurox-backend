import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";

@Processor("example")
export class ExampleProcessor extends WorkerHost {
  private readonly logger = new Logger(ExampleProcessor.name);

  async process(job: Job<Record<string, unknown>>): Promise<void> {
    this.logger.log(
      `Processing job ${job.id} with data: ${JSON.stringify(job.data)}`,
    );

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Job ${job.id} has failed with error: ${error.message}`);
  }

  @OnWorkerEvent("active")
  onActive(job: Job): void {
    this.logger.log(`Job ${job.id} is now active`);
  }
}
