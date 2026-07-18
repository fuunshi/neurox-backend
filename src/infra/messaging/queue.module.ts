import { Module, Global } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { ExampleProcessor } from "./processors/example.processor";
import { QueueService } from "./queue.service";

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
    BullModule.registerQueue({
      name: "example",
    }),
  ],
  providers: [ExampleProcessor, QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
