import { AccountLifecycleService } from "@/application/account/account-lifecycle.service";
import {
  ACCOUNT_QUEUE_EVENTS,
  ACCOUNT_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";

@Processor(ACCOUNT_QUEUE_NAME)
export class AccountWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountWorkerProcessor.name);

  constructor(private readonly accountLifecycle: AccountLifecycleService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === ACCOUNT_QUEUE_EVENTS.RECYCLE_EXPIRED_EMAILS) {
      const recycled = await this.accountLifecycle.recycleExpiredEmails();
      this.logger.log(
        `Account email recycling finished: ${recycled} address(es) released.`,
      );
      return;
    }

    this.logger.warn(`Unhandled account job received: ${job.name}`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Account job ${job.id} failed: ${error.message}`);
  }
}
