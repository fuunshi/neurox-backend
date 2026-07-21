import { SETTING_KEYS } from "@/common/constant/settings.constant";
import { SettingsService } from "@/infra/settings/settings.service";
import { User } from "@/database/entities";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Owns the account deletion lifecycle: the grace period during which a
 * soft-deleted account can still be recovered, and the recycling of its email
 * address once that window closes.
 *
 * Note on queries: every read here deliberately opts out of the global
 * `softDelete` filter (`{ filters: { softDelete: false } }`) because
 * soft-deleted rows are exactly what this service operates on.
 */
@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
  ) {}

  private async graceMs(): Promise<number> {
    const days = await this.settings.getNumber(
      SETTING_KEYS.ACCOUNT_RECYCLE_GRACE_DAYS,
    );
    return days * MS_PER_DAY;
  }

  /**
   * The moment after which a soft-deleted account for `email` can no longer be
   * recovered. Returns null when there is no recoverable account, either
   * because none exists, it is already recycled, or the window has elapsed.
   */
  async recoveryDeadline(email: string): Promise<Date | null> {
    const user = await this.findDeletedByEmail(email);
    if (!user?.deletedAt) return null;

    const deadline = new Date(
      user.deletedAt.getTime() + (await this.graceMs()),
    );
    return deadline.getTime() > Date.now() ? deadline : null;
  }

  /**
   * Restore a soft-deleted account. Ownership is proven with the original
   * password, so recovery does not depend on mail delivery to an address the
   * user may no longer control.
   */
  async recover(email: string, password: string): Promise<User> {
    const user = await this.findDeletedByEmail(email, true);

    if (!user?.deletedAt) {
      throw new UnauthorizedException(
        "No recoverable account exists for this email.",
      );
    }

    const deadline = new Date(
      user.deletedAt.getTime() + (await this.graceMs()),
    );
    if (deadline.getTime() <= Date.now()) {
      throw new UnauthorizedException(
        "The recovery window for this account has expired.",
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    user.deletedAt = null;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    // The profile is soft-deleted alongside the user in the same lifecycle.
    if (user.profile) {
      user.profile.deletedAt = null;
    }

    await this.em.flush();
    this.logger.log(`Account ${user.id} recovered.`);
    return user;
  }

  /**
   * Release the email addresses of accounts whose grace period has elapsed, by
   * rewriting `email` to `<deletedAtMillis>-<original>` and stamping
   * `emailRecycledAt`. The original address becomes available for new
   * registrations while the historical record is preserved.
   *
   * @returns the number of accounts recycled.
   */
  async recycleExpiredEmails(batchSize = 200): Promise<number> {
    const cutoff = new Date(Date.now() - (await this.graceMs()));

    const users = await this.em.find(
      User,
      { deletedAt: { $lte: cutoff }, emailRecycledAt: null },
      { filters: { softDelete: false }, limit: batchSize },
    );

    if (users.length === 0) {
      return 0;
    }

    const recycledAt = new Date();
    for (const user of users) {
      // Prefer the deletion timestamp: it is the meaningful historical fact,
      // and `email` being unique guarantees this stays collision-free.
      const stamp = (user.deletedAt ?? recycledAt).getTime();
      user.email = `${stamp}-${user.email}`;
      user.emailRecycledAt = recycledAt;
    }

    await this.em.flush();
    this.logger.log(`Recycled ${users.length} account email address(es).`);
    return users.length;
  }

  private async findDeletedByEmail(
    email: string,
    populateProfile = false,
  ): Promise<User | null> {
    return this.em.findOne(
      User,
      { email, deletedAt: { $ne: null }, emailRecycledAt: null },
      {
        filters: { softDelete: false },
        ...(populateProfile ? { populate: ["profile" as const] } : {}),
      },
    );
  }
}
