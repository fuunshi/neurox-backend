import {
  MAINTENANCE_QUEUE_EVENTS,
  MAINTENANCE_QUEUE_NAME,
} from "@/infra/queue/queue.constants";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";

/**
 * Registers the repeatable (cron) job that prunes expired rows.
 *
 * A stable `jobId` makes registration idempotent: restarting the worker updates
 * the existing schedule rather than stacking duplicate repeatables — the same
 * reason the account recycler uses one.
 */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE_NAME) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const pattern = this.configService.getOrThrow<string>("maintenance.cron");

    await this.queue.add(
      MAINTENANCE_QUEUE_EVENTS.RUN_MAINTENANCE,
      {},
      {
        repeat: { pattern },
        jobId: MAINTENANCE_QUEUE_EVENTS.RUN_MAINTENANCE,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(`Scheduled maintenance with cron "${pattern}".`);
  }
}
