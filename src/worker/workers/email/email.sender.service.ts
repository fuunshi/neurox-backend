import { EMAIL_TEMPLATES } from "@/infra/mail-queue/mail-queue.constants";
import {
  GenericEmailMessage,
  RawEmailMessage,
  ResearcherCredentialsPayload,
  TemplatedEmailMessage,
} from "@/infra/mail-queue/mail-queue.types";
import { TemplateRendererService } from "@/infra/mail-templates/template-renderer.service";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

type RenderedEmailContent = {
  subject: string;
  html: string;
  text?: string;
};

/**
 * `nodemailer` ships no types of its own, so the surface this service uses is
 * declared by hand: build a transport, then hand it a message. Transport
 * options are assembled from config and passed through untouched.
 */
type MailOptions = {
  host?: string;
  port: number;
  secure: boolean;
  auth?: { user?: string; pass?: string };
};

type MailTransporter = {
  sendMail(options: Record<string, unknown>): Promise<unknown>;
};

type MailModule = {
  createTransport(options: MailOptions): MailTransporter;
};

const mailer = nodemailer as unknown as MailModule;

// Templates are loaded from the template renderer service (mjml + handlebars files)
@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private readonly transporter: MailTransporter;
  private readonly fromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateRenderer: TemplateRendererService,
  ) {
    this.transporter = mailer.createTransport({
      host: this.configService.get<string>("smtp.host"),
      port: this.configService.get<number>("smtp.port") || 587,
      secure: this.configService.get<boolean>("smtp.secure") || false,
      auth:
        this.configService.get<string>("smtp.user") &&
        this.configService.get<string>("smtp.pass")
          ? {
              user: this.configService.get<string>("smtp.user"),
              pass: this.configService.get<string>("smtp.pass"),
            }
          : undefined,
    });

    this.fromEmail =
      this.configService.get<string>("smtp.from") || "no-reply@neurox.local";
  }

  async sendEmail(params: GenericEmailMessage): Promise<void> {
    const renderedContent = await this.resolveEmailContent(params);

    await this.transporter.sendMail({
      from: params.from || this.fromEmail,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      replyTo: params.replyTo,
      headers: params.headers,
      subject: renderedContent.subject,
      text: renderedContent.text,
      html: renderedContent.html,
    });

    this.logger.log(`Email sent to ${this.stringifyRecipient(params.to)}`);
  }

  async sendResearcherCredentialsEmail(
    params: ResearcherCredentialsPayload,
  ): Promise<void> {
    await this.sendEmail({
      to: params.email,
      template: EMAIL_TEMPLATES.RESEARCHER_CREDENTIALS,
      payload: params,
    });
  }

  // Pattern for adding more email types:
  // async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
  //   await this.sendEmail({
  //     to: email,
  //     template: EMAIL_TEMPLATES.PASSWORD_RESET,
  //     payload: { resetLink },
  //   });
  // }

  private async resolveEmailContent(
    params: GenericEmailMessage,
  ): Promise<RenderedEmailContent> {
    if (this.isRawEmailMessage(params)) {
      return {
        subject: params.subject,
        html: params.html,
        text: params.text,
      };
    }

    return this.renderTemplateEmail(params);
  }

  private async renderTemplateEmail(
    params: TemplatedEmailMessage<object>,
  ): Promise<RenderedEmailContent> {
    const rendered = await this.templateRenderer.render(
      params.template,
      params.payload as Record<string, unknown>,
    );

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: params.text,
    };
  }

  private isRawEmailMessage(
    params: GenericEmailMessage,
  ): params is RawEmailMessage {
    return "html" in params && !("template" in params);
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
