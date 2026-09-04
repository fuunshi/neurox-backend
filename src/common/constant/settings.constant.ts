/**
 * Keys for runtime-editable settings stored in the `app_setting` table.
 * Keep the dotted `<domain>.<name>` form so related settings group together.
 */
export const SETTING_KEYS = {
  /** Days after soft delete before the email address is released for reuse. */
  ACCOUNT_RECYCLE_GRACE_DAYS: "account.recycleGraceDays",
  /**
   * Days of request logging to keep before pruning.
   *
   * The interceptor writes a row per request and nothing ever removed them, so
   * this is the only thing bounding the table. Long enough to answer "what
   * happened last week", short enough that the table stops growing forever.
   */
  REQUEST_LOG_RETENTION_DAYS: "observability.requestLogRetentionDays",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Code-level defaults, used when the row is missing from `app_setting`. These
 * are what the application falls back to on a fresh database, so the system is
 * never dependent on a seed having run.
 */
export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  [SETTING_KEYS.ACCOUNT_RECYCLE_GRACE_DAYS]: "7",
  [SETTING_KEYS.REQUEST_LOG_RETENTION_DAYS]: "30",
};
