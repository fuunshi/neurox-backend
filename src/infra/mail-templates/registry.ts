import { EMAIL_TEMPLATES } from "@/infra/mail-queue/mail-queue.constants";
import { join } from "path";
import { BaseContext, PasswordResetPayload } from "./types";
import { VerifyEmailPayload } from "./types/verify-email";

export type TemplateKey =
  (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

type Registry = typeof TEMPLATE_REGISTRY;

export type TemplateRegistryEntry<TPayload, TContext> = {
  file: string;

  subject?: string;

  buildContext?: (payload: TPayload, base: BaseContext) => TContext;
};

export type TemplatePayload<K extends keyof Registry> =
  Registry[K] extends TemplateRegistryEntry<infer P, any> ? P : never;

export type TemplateContext<K extends keyof Registry> =
  Registry[K] extends TemplateRegistryEntry<any, infer C> ? C : never;

// export type TemplateRegistryEntry = {
//   file: string;
//   subject?: string;
//   textFile?: string;
//   buildContext?: (payload: any, base: BaseContext) => any;
// };

const base = join(__dirname, "templates");

// Registry maps template keys to template files organized by domain
// New templates should follow the same structure: domain/purpose.mjml.hbs
export const TEMPLATE_REGISTRY = {
  [EMAIL_TEMPLATES.RESEARCHER_CREDENTIALS]: {
    file: join(base, "emails", "researcher", "credentials.mjml.hbs"),
    subject: "Your neurox Researcher Account Credentials",
  },
  [EMAIL_TEMPLATES.PASSWORD_RESET]: {
    file: join(base, "emails", "auth", "password-reset.mjml.hbs"),
    subject: "Reset Your Password",
    buildContext: (payload: PasswordResetPayload, base: BaseContext) => ({
      resetLink: `${base.frontendBaseUrl}/reset-password?token=${payload.token}`,
    }),
  },
  [EMAIL_TEMPLATES.VERIFY_EMAIL]: {
    file: join(base, "emails", "auth", "verify-email.mjml.hbs"),
    subject: "Verify Your Email Address",
    buildContext: (payload: VerifyEmailPayload, base: BaseContext) => ({
      verifyLink: `${base.frontendBaseUrl}/auth/verify-email?token=${payload.token}`,
    }),
  },
  [EMAIL_TEMPLATES.ORGANIZATION_MEMBER_CREDENTIALS]: {
    file: join(base, "emails", "organization", "member-credentials.mjml.hbs"),
    subject: "Your neurox Organization Account Credentials",
    buildContext: (payload: VerifyEmailPayload, base: BaseContext) => ({
      verifyLink: `${base.frontendBaseUrl}/auth/login`,
    }),
  },
  // [EMAIL_TEMPLATES.PASSWORD_RESET]: {
  //   file: join(__dirname, 'templates', 'auth', 'password-reset.mjml.hbs'),
  //   subject: 'Reset Your Password',
  // },
  // [EMAIL_TEMPLATES.WELCOME]: {
  //   file: join(__dirname, 'templates', 'auth', 'welcome.mjml.hbs'),
  //   subject: 'Welcome to neurox',
  // },
  // [EMAIL_TEMPLATES.ALERT_NOTIFICATION]: {
  //   file: join(__dirname, 'templates', 'notifications', 'alert.mjml.hbs'),
  //   subject: '{{alertTitle}}',
  // },
} as const satisfies Record<TemplateKey, TemplateRegistryEntry<any, any>>;

export default TEMPLATE_REGISTRY;
