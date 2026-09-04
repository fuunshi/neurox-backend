import { MaintenanceService } from "@/application/maintenance/maintenance.service";
import {
  MAINTENANCE_QUEUE_EVENTS,
  MAINTENANCE_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";

@Processor(MAINTENANCE_QUEUE_NAME)
export class MaintenanceWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorkerProcessor.name);

  constructor(private readonly maintenance: MaintenanceService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === MAINTENANCE_QUEUE_EVENTS.RUN_MAINTENANCE) {
      await this.maintenance.run();
      return;
    }

    this.logger.warn(`Unhandled maintenance job received: ${job.name}`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, error: Error): void {
    // Logged rather than rethrown: a maintenance run that fails is worth
    // knowing about, but it is not worth taking the worker down for, and the
    // next cron will try again.
    this.logger.error(`Maintenance job ${job.id} failed: ${error.message}`);
  }
}
