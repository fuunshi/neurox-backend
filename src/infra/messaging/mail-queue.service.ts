import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import {
  EMAIL_TEMPLATES,
  MAIL_QUEUE_CLIENT,
  MAIL_QUEUE_EVENTS,
} from "./mail-queue.constants";
import {
  GenericEmailMessage,
  ResearcherCredentialsMessage,
} from "./mail-queue.types";

@Injectable()
export class MailQueueService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MailQueueService.name);

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
