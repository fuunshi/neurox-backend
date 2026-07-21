/** Machine-readable error codes returned by account lifecycle endpoints. */
export const ACCOUNT_ERROR_CODES = {
  /**
   * Registration hit an email belonging to a soft-deleted account that is
   * still inside its recovery window, so the caller should be offered account
   * recovery rather than told the address is simply taken.
   */
  ACCOUNT_RECOVERABLE: "ACCOUNT_RECOVERABLE",
} as const;

export type AccountErrorCode =
  (typeof ACCOUNT_ERROR_CODES)[keyof typeof ACCOUNT_ERROR_CODES];
