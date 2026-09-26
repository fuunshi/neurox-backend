import { Logger } from "@nestjs/common";
import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import { LivenessService } from "./liveness.service";

/** Named locals rather than reading mocks off the object they are placed on —
 *  see the note in `request-id.interceptor.spec.ts`. */
function makeEm(execute: () => Promise<unknown>) {
  return {
    em: { getConnection: () => ({ execute }) } as unknown as EntityManager,
    execute: vi.fn(execute),
  };
}

const ROW = { samples: 12, avg_ms: 41.5, p95_ms: 88 };

describe("LivenessService", () => {
  it("reports identity alongside the measured latency", async () => {
    const { em } = makeEm(() => Promise.resolve([ROW]));

    const report = await new LivenessService(em).report();

    expect(report.status).toBe("ok");
    expect(report.hostname).toEqual(expect.any(String));
    expect(report.pid).toBe(process.pid);
    expect(report.latency).toEqual({
      windowMinutes: 5,
      samples: 12,
      avgMs: 41.5,
      p95Ms: 88,
    });
  });

  it("calls a quiet window no measurement rather than zero", async () => {
    const { em } = makeEm(() => Promise.resolve([]));

    const report = await new LivenessService(em).report();

    expect(report.latency.samples).toBe(0);
    expect(report.latency.avgMs).toBeNull();
    expect(report.latency.p95Ms).toBeNull();
  });

  /**
   * The invariant this service exists to hold.
   *
   * `request_log` is a Postgres table, so the latency figure is the one thing
   * in liveness that could reach a dependency. If it is allowed to throw, a
   * database that is down — or a fresh volume whose migrations have not run —
   * turns `GET /health` into a 500, and an orchestrator answers that by
   * restarting every instance at once, plus the UAT healthcheck never passes.
   */
  it("stays alive when the request log cannot be read", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { em } = makeEm(() =>
      Promise.reject(new Error('relation "request_log" does not exist')),
    );

    const report = await new LivenessService(em).report();

    expect(report.status).toBe("ok");
    expect(report.latency).toEqual({
      windowMinutes: 5,
      samples: 0,
      avgMs: null,
      p95Ms: null,
    });
    // Degrading is not the same as hiding: a reachable database with no
    // migrations pings as healthy, so this warning is the only signal.
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
