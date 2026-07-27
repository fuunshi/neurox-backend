/**
 * Backed by the native Postgres enum `card_status`.
 *
 * Generated cards land in `DRAFT` so a human can review them before they enter
 * study and quiz pools; only `ACTIVE` cards are eligible for those.
 */
export const CARD_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export type CardStatus = (typeof CARD_STATUS)[keyof typeof CARD_STATUS];
