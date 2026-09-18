export * from "./account-status.enum";
export * from "./audit-action.enum";
export * from "./card-status.enum";
export * from "./content-status.enum";
export * from "./curriculum-kind.enum";
export * from "./generation-job-status.enum";
export * from "./quiz-attempt-status.enum";
export * from "./quiz-format.enum";
export * from "./review-rating.enum";
export * from "./role.enum";
export * from "./source-status.enum";
export * from "./source-type.enum";
export * from "./token-type.enum";

/**
 * Entity name -> native Postgres type name. These are created by the initial
 * migration and deliberately keep the lowercase names used by the former Prisma
 * schema (`@@map`), so databases created before the MikroORM migration still
 * resolve their enum columns.
 */
export const NATIVE_ENUM_NAMES = {
  Role: "role",
  AccountStatus: "account_status",
  TokenType: "token_type",
  AuditAction: "audit_action",
  SourceType: "source_type",
  SourceStatus: "source_status",
  CardStatus: "card_status",
  GenerationJobStatus: "generation_job_status",
  ReviewRating: "review_rating",
  QuizFormat: "quiz_format",
  QuizAttemptStatus: "quiz_attempt_status",
  // Both belong to the public study-material model. They are new here rather
  // than inherited from the Prisma schema, so their names are ours to choose.
  CurriculumKind: "curriculum_kind",
  ContentStatus: "content_status",
} as const;
