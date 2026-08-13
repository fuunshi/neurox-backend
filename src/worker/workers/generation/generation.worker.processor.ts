import { GenerationService } from "@/application/generation/generation.service";
import {
  GENERATION_QUEUE_EVENTS,
  GENERATION_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";

/**
 * Consumes generation jobs.
 *
 * Thin by design, like the email processor: the work belongs to
 * `GenerationService`, which the HTTP side also uses, so both runtimes share one
 * implementation of the rules. Anything that lived here would be invisible to
 * the API.
 *
 * Failures are not swallowed. `processJob` records them on the job *and*
 * rethrows, so BullMQ applies its retry policy while the job's own row already
 * shows what went wrong.
 */
@Processor(GENERATION_QUEUE_NAME)
export class GenerationWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationWorkerProcessor.name);

  constructor(private readonly generationService: GenerationService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    if (job.name !== GENERATION_QUEUE_EVENTS.GENERATE_CARDS) {
      // An unknown job name on this queue means a producer and a consumer have
      // drifted apart. Logged rather than thrown, so one bad message cannot
      // block the queue behind it.
      this.logger.warn(
        `Ignoring unknown job name on generation queue: ${job.name}`,
      );
      return;
    }

    await this.generationService.processJob(job.data.jobId);
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job): void {
    this.logger.log(`Generation job ${job.id} finished`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Generation job ${job.id} failed on attempt ${job.attemptsMade}: ${error.message}`,
    );
  }
}
