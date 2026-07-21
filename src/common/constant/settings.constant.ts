/**
 * Keys for runtime-editable settings stored in the `app_setting` table.
 * Keep the dotted `<domain>.<name>` form so related settings group together.
 */
export const SETTING_KEYS = {
  /** Days after soft delete before the email address is released for reuse. */
  ACCOUNT_RECYCLE_GRACE_DAYS: "account.recycleGraceDays",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Code-level defaults, used when the row is missing from `app_setting`. These
 * are what the application falls back to on a fresh database, so the system is
 * never dependent on a seed having run.
 */
export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  [SETTING_KEYS.ACCOUNT_RECYCLE_GRACE_DAYS]: "7",
};
