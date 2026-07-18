import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger, Inject } from "@nestjs/common";
import { Job } from "bullmq";
import { Transporter } from "nodemailer";
import { GenericEmailMessage } from "../mail-queue.types";

@Processor("mail")
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly maxRetries = 5;

  constructor(
    @Inject("MAIL_TRANSPORTER") private readonly transporter: Transporter,
  ) {
    super();
  }

  /**
   * Process mail jobs from the Bull MQ queue
   * @param job Mail job containing email details
   * @returns void
   */
  async process(job: Job<GenericEmailMessage>): Promise<void> {
    const { to, subject, html, text, cc, bcc } = job.data;

    this.logger.log(
      `Processing mail job ${job.id}: sending email to ${Array.isArray(to) ? to.join(", ") : to}`,
    );

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || "noreply@flashcards.com",
        to,
        subject,
        html,
        text,
        cc,
        bcc,
      };

      const result = await this.transporter.sendMail(mailOptions);

      this.logger.log(
        `Mail job ${job.id} sent successfully. Message ID: ${result.messageId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error processing mail job ${job.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      // Retry failed jobs
      if (job.attemptsMade < this.maxRetries) {
        const delay = Math.pow(2, job.attemptsMade) * 1000; // Exponential backoff
        await job.retry();
        throw error;
      } else {
        this.logger.error(
          `Mail job ${job.id} failed after ${this.maxRetries} retries`,
        );
        throw error;
      }
    }
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
