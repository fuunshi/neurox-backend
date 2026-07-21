export * from "./account-status.enum";
export * from "./audit-action.enum";
export * from "./role.enum";
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
} as const;
