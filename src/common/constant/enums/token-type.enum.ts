/**
 * The persisted `token.token_type` column.
 *
 * Backed by the native Postgres enum `token_type`. Named `DB_TOKEN_TYPE` to
 * keep it distinct from `TOKEN_TYPE` in `@/common/types/token.type`, which is
 * the unrelated *JWT* token type (`access` / `refresh` / `mfa_temp` / `temp`)
 * and is imported alongside this one in the auth service.
 */
export const DB_TOKEN_TYPE = {
  ACCESS: "ACCESS",
  REFRESH: "REFRESH",
  PASSWORD_RESET: "PASSWORD_RESET",
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
} as const;

export type TokenType = (typeof DB_TOKEN_TYPE)[keyof typeof DB_TOKEN_TYPE];
