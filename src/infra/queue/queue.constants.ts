/** Queue carrying account lifecycle jobs (email recycling, etc.). */
export const ACCOUNT_QUEUE_NAME = "account";

export const ACCOUNT_QUEUE_EVENTS = {
  RECYCLE_EXPIRED_EMAILS: "recycle-expired-emails",
} as const;

export type AccountQueueEvent =
  (typeof ACCOUNT_QUEUE_EVENTS)[keyof typeof ACCOUNT_QUEUE_EVENTS];
