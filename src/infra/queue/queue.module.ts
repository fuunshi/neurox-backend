import { Module, Global } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import {
  ACCOUNT_QUEUE_NAME,
  GENERATION_QUEUE_NAME,
  MAINTENANCE_QUEUE_NAME,
} from "./queue.constants";

/**
 * BullMQ root configuration, shared by both entrypoints.
 *
 * The mail queue is not registered here: `MailQueueModule` owns it, along with
 * the connection options and the service that enqueues to it. Registering it
 * again under the literal `"mail"` produced a second Queue instance for the same
 * queue name, and the two would have drifted apart the moment one connection
 * config changed.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>("redis.host") || "localhost",
          port: configService.get<number>("redis.port") || 6379,
          password: configService.get<string>("redis.password") || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: ACCOUNT_QUEUE_NAME,
      },
      {
        name: GENERATION_QUEUE_NAME,
      },
      {
        name: MAINTENANCE_QUEUE_NAME,
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
