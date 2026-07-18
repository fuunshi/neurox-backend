export const MAIL_QUEUE_CLIENT = "MAIL_QUEUE_CLIENT";

export const MAIL_QUEUE_RETRY_BASE_DELAY_MS = 1000;
export const MAIL_QUEUE_RETRY_MAX_ATTEMPTS = 5;

export const MAIL_QUEUE_EVENTS = {
  EMAIL_SEND: "mail.email.send",
  RESEARCHER_CREDENTIALS: "mail.researcher.credentials",
} as const;

export const EMAIL_TEMPLATES = {
  RESEARCHER_CREDENTIALS: "researcher_credentials",
  ORGANIZATION_MEMBER_CREDENTIALS: "organization_member_credentials",
  PASSWORD_RESET: "password_reset",
  VERIFY_EMAIL: "verify_email",
} as const;
