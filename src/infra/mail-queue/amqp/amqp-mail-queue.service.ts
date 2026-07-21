import { EMAIL_TEMPLATES, MAIL_QUEUE_EVENTS } from "../mail-queue.constants";
import {
  GenericEmailMessage,
  ResearcherCredentialsMessage,
} from "../mail-queue.types";
import { MAIL_QUEUE_CLIENT } from "./amqp.constants";
import { ClientProxy } from "@nestjs/microservices";
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { firstValueFrom } from "rxjs";

/**
 * RabbitMQ-backed mail queue.
 *
 * The AMQP counterpart of the BullMQ `MailQueueService`; same public surface, so
 * switching transports is a module swap. Named with the `Amqp` prefix to keep it
 * distinct from the live service of the same shape.
 */
@Injectable()
export class AmqpMailQueueService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AmqpMailQueueService.name);

  constructor(
    @Inject(MAIL_QUEUE_CLIENT) private readonly client: ClientProxy,
  ) {}

  async onApplicationBootstrap() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  async enqueueEmail(payload: GenericEmailMessage): Promise<void> {
    await firstValueFrom(
      this.client.emit(MAIL_QUEUE_EVENTS.EMAIL_SEND, payload),
    );

    this.logger.log(
      `Queued email job for ${this.stringifyRecipient(payload.to)}`,
    );
  }

  async enqueueResearcherCredentials(
    payload: ResearcherCredentialsMessage,
  ): Promise<void> {
    await this.enqueueEmail({
      to: payload.email,
      template: EMAIL_TEMPLATES.RESEARCHER_CREDENTIALS,
      payload: {
        email: payload.email,
        password: payload.password,
        loginLink: payload.loginLink,
      },
      retryAttempt: payload.retryAttempt,
    });
  }

  private stringifyRecipient(recipient: GenericEmailMessage["to"]): string {
    if (Array.isArray(recipient)) {
      return recipient
        .map((entry) => (typeof entry === "string" ? entry : entry.email))
        .join(", ");
    }

    return typeof recipient === "string" ? recipient : recipient.email;
  }
}
