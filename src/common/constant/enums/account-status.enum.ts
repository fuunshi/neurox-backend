/** Backed by the native Postgres enum `account_status`. */
export const ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
} as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];
