/** Backed by the native Postgres enum `audit_action`. */
export const AUDIT_ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  ROLE_CHANGE: "ROLE_CHANGE",
  TOKEN_REVOKE: "TOKEN_REVOKE",
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
