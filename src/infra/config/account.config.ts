import { registerAs } from "@nestjs/config";

export default registerAs("account", () => ({
  /**
   * Cron pattern for the account email recycling job. The *grace period*
   * itself is deliberately NOT here -- it is an admin-editable row in the
   * `app_setting` table (`account.recycleGraceDays`); this is only the
   * schedule on which the job runs.
   */
  recycleCron: process.env.ACCOUNT_RECYCLE_CRON || "0 3 * * *",
}));
