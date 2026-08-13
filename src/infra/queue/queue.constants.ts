/** Queue carrying account lifecycle jobs (email recycling, etc.). */
export const ACCOUNT_QUEUE_NAME = "account";

export const ACCOUNT_QUEUE_EVENTS = {
  RECYCLE_EXPIRED_EMAILS: "recycle-expired-emails",
} as const;

export type AccountQueueEvent =
  (typeof ACCOUNT_QUEUE_EVENTS)[keyof typeof ACCOUNT_QUEUE_EVENTS];

/**
 * Queue carrying card-generation jobs.
 *
 * Separate from the account queue so that a slow generation run — a hosted model
 * over thirty chunks — cannot delay a cron job, and so each can be scaled or
 * paused independently.
 */
export const GENERATION_QUEUE_NAME = "generation";

export const GENERATION_QUEUE_EVENTS = {
  GENERATE_CARDS: "generate-cards",
} as const;

export type GenerationQueueEvent =
  (typeof GENERATION_QUEUE_EVENTS)[keyof typeof GENERATION_QUEUE_EVENTS];
