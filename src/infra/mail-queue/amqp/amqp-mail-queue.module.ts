import { MAIL_QUEUE_CLIENT } from "./amqp.constants";
import { AmqpMailQueueService } from "./amqp-mail-queue.service";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";

/**
 * RabbitMQ transport for the mail queue.
 *
 * Deliberately NOT imported by `InfraModule` — the BullMQ `MailQueueModule` is
 * the live implementation. Enabling this is a one-line swap in `InfraModule`,
 * but note that the worker side would also need an AMQP consumer to replace
 * `EmailWorkerProcessor`.
 *
 * Reads the `rabbitmq.*` config namespace, which is already registered and
 * populated even though nothing else consumes it.
 */
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
  providers: [AmqpMailQueueService],
  exports: [AmqpMailQueueService],
})
export class AmqpMailQueueModule {}
