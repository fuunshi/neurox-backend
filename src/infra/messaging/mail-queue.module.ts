import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { MailQueueService } from "./mail-queue.service";
import { MAIL_QUEUE_CLIENT } from "./mail-queue.constants";

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: MAIL_QUEUE_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: configService.get<string[]>("rabbitmq.urls") || [
              "amqp://localhost:5672",
            ],
            queue:
              configService.get<string>("rabbitmq.mailQueue") ||
              "mail.outbound",
            queueOptions: {
              durable:
                configService.get<boolean>("rabbitmq.queueDurable") ?? true,
            },
          },
        }),
      },
    ]),
  ],
  providers: [MailQueueService],
  exports: [MailQueueService],
})
export class MailQueueModule {}
