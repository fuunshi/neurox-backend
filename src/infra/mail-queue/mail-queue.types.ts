import { EMAIL_TEMPLATES } from "./mail-queue.constants";

export type EmailTemplateName =
  (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

export interface EmailAddress {
  email: string;
  name?: string;
}

export type EmailRecipient = string | EmailAddress;

export interface BaseEmailMessage {
  to: EmailRecipient | EmailRecipient[];
  from?: EmailRecipient;
  cc?: EmailRecipient | EmailRecipient[];
  bcc?: EmailRecipient | EmailRecipient[];
  replyTo?: EmailRecipient;
  subject?: string;
  text?: string;
  headers?: Record<string, string>;
  retryAttempt?: number;
}

export interface TemplatedEmailMessage<
  TPayload extends object = Record<string, unknown>,
> extends BaseEmailMessage {
  template: EmailTemplateName;
  payload: TPayload;
  html?: string;
}

export interface RawEmailMessage extends BaseEmailMessage {
  subject: string;
  html: string;
  template?: never;
  payload?: never;
}

export type GenericEmailMessage =
  | TemplatedEmailMessage<object>
  | RawEmailMessage;

export interface ResearcherCredentialsPayload {
  email: string;
  password: string;
  loginLink: string;
}

export interface ResearcherCredentialsMessage extends ResearcherCredentialsPayload {
  retryAttempt?: number;
}
