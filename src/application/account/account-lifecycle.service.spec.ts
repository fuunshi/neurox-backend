import { SETTING_KEYS } from "@/common/constant/settings.constant";
import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("bcryptjs", () => ({ compare: vi.fn() }));

import * as bcrypt from "bcryptjs";
import { AccountLifecycleService } from "./account-lifecycle.service";

/**
 * Deleting an account is the entry point the rest of the lifecycle was missing:
 * everything else reads `deletedAt`, and nothing set it. So the assertions here
 * are about what a deletion has to leave behind — a stamped user *and* profile,
 * dead sessions, and a deadline the client can show.
 */

const compare = vi.mocked(bcrypt.compare);

interface FakeUser {
  id: string;
  email: string;
  password: string;
  deletedAt: Date | null;
  profile: { deletedAt: Date | null } | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

function build(user: FakeUser | null, graceDays = 7) {
  const findOne = vi.fn(() => Promise.resolve(user));
  const flush = vi.fn(() => Promise.resolve());
  const revokeAllUserTokens = vi.fn(() => Promise.resolve(2));
  const getNumber = vi.fn(() => Promise.resolve(graceDays));

  const service = new AccountLifecycleService(
    { findOne, flush } as never,
    { getNumber } as never,
    { revokeAllUserTokens } as never,
  );

  return { service, findOne, flush, revokeAllUserTokens, getNumber };
}

function aUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "user-1",
    email: "reader@example.com",
    password: "hashed",
    deletedAt: null,
    profile: { deletedAt: null },
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

describe("AccountLifecycleService.remove", () => {
  beforeEach(() => {
    compare.mockReset();
  });

  it("stamps the user and the profile together", async () => {
    compare.mockResolvedValue(true as never);
    const user = aUser();
    const { service, flush } = build(user);

    await service.remove("user-1", "plaintext");

    expect(user.deletedAt).toBeInstanceOf(Date);
    // Both, or a live profile is left attached to a deleted account — and
    // `recover()` restores both, so they must be deleted together too.
    expect(user.profile?.deletedAt).toBe(user.deletedAt);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("ends every session, so a deleted account cannot keep being used", async () => {
    compare.mockResolvedValue(true as never);
    const { service, revokeAllUserTokens } = build(aUser());

    await service.remove("user-1", "plaintext");

    expect(revokeAllUserTokens).toHaveBeenCalledWith(
      "user-1",
      "Account deleted",
    );
  });

  it("reports a deadline the client can show", async () => {
    compare.mockResolvedValue(true as never);
    const { service } = build(aUser(), 7);

    const before = Date.now();
    const { recoverableUntil } = await service.remove("user-1", "plaintext");

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(recoverableUntil.getTime()).toBeGreaterThanOrEqual(
      before + sevenDays - 1000,
    );
    expect(recoverableUntil.getTime()).toBeLessThanOrEqual(
      Date.now() + sevenDays + 1000,
    );
  });

  it("reads the grace period rather than assuming it", async () => {
    compare.mockResolvedValue(true as never);
    const { service, getNumber } = build(aUser(), 3);

    await service.remove("user-1", "plaintext");

    expect(getNumber).toHaveBeenCalledWith(
      SETTING_KEYS.ACCOUNT_RECYCLE_GRACE_DAYS,
    );
  });

  it("refuses a wrong password and changes nothing", async () => {
    compare.mockResolvedValue(false as never);
    const user = aUser();
    const { service, flush, revokeAllUserTokens } = build(user);

    await expect(service.remove("user-1", "wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // The password is required precisely so a borrowed session cannot do this;
    // a failed attempt must leave no trace of having tried.
    expect(user.deletedAt).toBeNull();
    expect(user.profile?.deletedAt).toBeNull();
    expect(flush).not.toHaveBeenCalled();
    expect(revokeAllUserTokens).not.toHaveBeenCalled();
  });

  it("refuses an account that does not exist", async () => {
    const { service } = build(null);

    await expect(service.remove("ghost", "whatever")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(compare).not.toHaveBeenCalled();
  });

  it("deletes a user who has no profile row", async () => {
    compare.mockResolvedValue(true as never);
    const user = aUser({ profile: null });
    const { service } = build(user);

    await expect(service.remove("user-1", "plaintext")).resolves.toBeDefined();
    expect(user.deletedAt).toBeInstanceOf(Date);
  });
});
