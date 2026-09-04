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

/**
 * Queue carrying housekeeping jobs.
 *
 * Its own queue rather than a second job on `account`, because the two have
 * nothing to do with each other: a maintenance run that deletes a large batch
 * of rows should not be able to delay the account-recycling cron, and either
 * can be paused on its own.
 */
export const MAINTENANCE_QUEUE_NAME = "maintenance";

export const MAINTENANCE_QUEUE_EVENTS = {
  RUN_MAINTENANCE: "run-maintenance",
} as const;

export type MaintenanceQueueEvent =
  (typeof MAINTENANCE_QUEUE_EVENTS)[keyof typeof MAINTENANCE_QUEUE_EVENTS];
