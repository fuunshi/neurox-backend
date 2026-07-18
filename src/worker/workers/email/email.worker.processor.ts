import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import {
  MAIL_QUEUE_EVENTS,
  MAIL_QUEUE_NAME,
} from "@/common/modules/mail-queue/mail-queue.constants";
import {
  GenericEmailMessage,
  ResearcherCredentialsMessage,
} from "@/common/modules/mail-queue/mail-queue.types";
import { EmailSenderService } from "./email.sender.service";

@Processor(MAIL_QUEUE_NAME)
export class EmailWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailWorkerProcessor.name);

  constructor(private readonly emailSenderService: EmailSenderService) {
    super();
  }

  async process(
    job: Job<GenericEmailMessage | ResearcherCredentialsMessage>,
  ): Promise<void> {
    if (job.name === MAIL_QUEUE_EVENTS.RESEARCHER_CREDENTIALS) {
      const payload = job.data as ResearcherCredentialsMessage;
      await this.emailSenderService.sendResearcherCredentialsEmail(payload);
      this.logger.log(`Processed ${job.name} for ${payload.email}`);
      return;
    }

    await this.emailSenderService.sendEmail(job.data as GenericEmailMessage);
    this.logger.log(`Processed ${job.name}`);
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job): void {
    this.logger.log(`Mail job ${job.id} has been completed`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Mail job ${job.id} has failed: ${error.message}`);
  }

  @OnWorkerEvent("active")
  onActive(job: Job): void {
    this.logger.debug(`Mail job ${job.id} is now active`);
  }
}
