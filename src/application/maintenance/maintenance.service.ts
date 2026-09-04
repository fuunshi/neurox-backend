import { SETTING_KEYS } from "@/common/constant/settings.constant";
import { SettingsService } from "@/infra/settings/settings.service";
import { TokenService } from "@/infra/token/token.service";
import { RequestLog } from "@/database/entities";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable, Logger } from "@nestjs/common";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Housekeeping for the two tables that grow on their own.
 *
 * Neither is anybody's feature, which is exactly why both were missed: the
 * request logger writes a row per request and the token service writes a row
 * per refresh, and nothing ever removed either. Left alone they grow until
 * someone notices the disk, and the audit trail they exist to provide is
 * buried in its own noise.
 *
 * Both methods are idempotent and bounded, so running the job twice or running
 * it late costs nothing.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Remove `request_log` rows older than the retention window.
   *
   * A hard delete, not the soft delete every other model uses. Soft delete
   * exists so a row can be hidden and restored by the application; here the
   * whole point is that the table stops occupying space, and marking rows
   * deleted would leave every byte of a table that gains a row per request.
   *
   * `filters: false` because the default soft-delete filter would hide already
   * soft-deleted rows from this query, so they would be the one thing old
   * enough to prune that never got pruned.
   */
  async pruneRequestLogs(): Promise<number> {
    const days = await this.settings.getNumber(
      SETTING_KEYS.REQUEST_LOG_RETENTION_DAYS,
    );
    const cutoff = new Date(Date.now() - days * MS_PER_DAY);

    const removed = await this.em.nativeDelete(
      RequestLog,
      { createdAt: { $lt: cutoff } },
      { filters: false },
    );

    if (removed > 0) {
      this.logger.log(
        `Pruned ${removed} request log row(s) older than ${days} day(s).`,
      );
    }

    return removed;
  }

  /**
   * One entry point for the scheduler, so a third table to tidy up means adding
   * a call here rather than another cron.
   */
  async run(): Promise<{ tokensRemoved: number; logsPruned: number }> {
    const tokensRemoved = await this.tokens.cleanupExpiredTokens();
    const logsPruned = await this.pruneRequestLogs();

    this.logger.log(
      `Maintenance finished: ${tokensRemoved} token(s) removed, ${logsPruned} request log row(s) pruned.`,
    );

    return { tokensRemoved, logsPruned };
  }
}
