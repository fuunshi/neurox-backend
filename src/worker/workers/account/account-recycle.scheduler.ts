import {
  ACCOUNT_QUEUE_EVENTS,
  ACCOUNT_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";

/**
 * Registers the repeatable (cron) job that recycles elapsed account emails.
 *
 * A stable `jobId` makes registration idempotent: restarting the worker
 * updates the existing schedule rather than stacking duplicate repeatables.
 */
@Injectable()
export class AccountRecycleScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountRecycleScheduler.name);

  constructor(
    @InjectQueue(ACCOUNT_QUEUE_NAME) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const pattern = this.configService.getOrThrow<string>(
      "account.recycleCron",
    );

    await this.queue.add(
      ACCOUNT_QUEUE_EVENTS.RECYCLE_EXPIRED_EMAILS,
      {},
      {
        repeat: { pattern },
        jobId: ACCOUNT_QUEUE_EVENTS.RECYCLE_EXPIRED_EMAILS,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Scheduled account email recycling with cron "${pattern}".`,
    );
  }
}
