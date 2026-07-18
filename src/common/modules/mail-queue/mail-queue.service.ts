import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  EMAIL_TEMPLATES,
  MAIL_QUEUE_NAME,
  MAIL_QUEUE_RETRY_BASE_DELAY_MS,
  MAIL_QUEUE_RETRY_MAX_ATTEMPTS,
  MAIL_QUEUE_EVENTS,
} from "./mail-queue.constants";
import {
  GenericEmailMessage,
  ResearcherCredentialsMessage,
} from "./mail-queue.types";

@Injectable()
export class MailQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MailQueueService.name);

  constructor(
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue,
  ) {}

  async onModuleDestroy() {
    await this.mailQueue.close();
  }

  async enqueueEmail(payload: GenericEmailMessage): Promise<void> {
    await this.mailQueue.add(MAIL_QUEUE_EVENTS.EMAIL_SEND, payload, {
      attempts: MAIL_QUEUE_RETRY_MAX_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: MAIL_QUEUE_RETRY_BASE_DELAY_MS,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

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
