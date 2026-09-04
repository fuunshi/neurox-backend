import { SETTING_KEYS } from "@/common/constant/settings.constant";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceService } from "./maintenance.service";

/**
 * The retention job is the only thing bounding `request_log`, so the two things
 * worth pinning are that it computes the window from the setting, and that it
 * deletes rather than soft-deletes with the filter turned off — the default
 * soft-delete filter would hide exactly the rows old enough to prune.
 */

interface NativeDeleteCall {
  where: { createdAt: { $lt: Date } };
  options: { filters: boolean };
}

function build(days = 30, tokensRemoved = 3) {
  // Declared without parameters on purpose: the arguments are asserted through
  // `mock.calls`, and naming them only to ignore them trips `no-unused-vars`.
  const nativeDelete = vi.fn(() => Promise.resolve(5));

  const em = { nativeDelete };
  const settings = {
    getNumber: vi.fn((key: string) =>
      Promise.resolve(
        key === SETTING_KEYS.REQUEST_LOG_RETENTION_DAYS ? days : 0,
      ),
    ),
  };
  const tokens = {
    cleanupExpiredTokens: vi.fn(() => Promise.resolve(tokensRemoved)),
  };

  const service = new MaintenanceService(
    em as never,
    settings as never,
    tokens as never,
  );

  return { service, nativeDelete, settings, tokens };
}

describe("MaintenanceService", () => {
  it("prunes against a window computed from the setting", async () => {
    const { service, nativeDelete } = build(30);

    const before = Date.now();
    await service.pruneRequestLogs();
    const after = Date.now();

    const [, , options] = nativeDelete.mock.calls[0] as unknown as [
      unknown,
      NativeDeleteCall["where"],
      NativeDeleteCall["options"],
    ];
    expect(options).toEqual({ filters: false });

    const cutoff = (
      nativeDelete.mock.calls[0] as unknown as [
        unknown,
        NativeDeleteCall["where"],
      ]
    )[1].createdAt.$lt;

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - thirtyDays - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - thirtyDays + 1000);
  });

  it("honours a different retention window", async () => {
    const { service, nativeDelete } = build(7);
    await service.pruneRequestLogs();

    const cutoff = (
      nativeDelete.mock.calls[0] as unknown as [
        unknown,
        NativeDeleteCall["where"],
      ]
    )[1].createdAt.$lt;

    // A week, not a month.
    const elapsed = Date.now() - cutoff.getTime();
    expect(elapsed).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    expect(elapsed).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it("runs both jobs and reports what each removed", async () => {
    const { service, tokens } = build(30, 3);

    const result = await service.run();

    expect(tokens.cleanupExpiredTokens).toHaveBeenCalledOnce();
    expect(result).toEqual({ tokensRemoved: 3, logsPruned: 5 });
  });
});
