import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailQueueService } from "./mail-queue.service";
import { MAIL_QUEUE_NAME } from "./mail-queue.constants";

@Global()
@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: MAIL_QUEUE_NAME,
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
  ],
  providers: [MailQueueService],
  exports: [MailQueueService],
})
export class MailQueueModule {}
