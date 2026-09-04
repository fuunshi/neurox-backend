import { registerAs } from "@nestjs/config";

export default registerAs("maintenance", () => ({
  /**
   * Cron pattern for the housekeeping job that prunes expired tokens and old
   * request-log rows. The *retention windows* themselves are deliberately not
   * here -- they are admin-editable rows in the `app_setting` table; this is
   * only the schedule on which the job runs.
   *
   * Off-peak, and deliberately not on the hour: every deployment that copied
   * this file would otherwise wake up together.
   */
  cron: process.env.MAINTENANCE_CRON || "17 4 * * *",
}));
