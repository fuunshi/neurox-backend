import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { hostname } from "node:os";

interface LatencyRow {
  samples: number;
  avg_ms: number | null;
  p95_ms: number | null;
}

/**
 * What this process is, and how it has been answering.
 *
 * The counterpart to the readiness endpoint, and deliberately the opposite kind
 * of thing: readiness asks whether the *dependencies* are reachable, and this
 * asks nothing at all. It reports identity — which host, which process, how long
 * it has been up — and a latency figure read from its own request log. That
 * separation is the point: an orchestrator that restarts on liveness must not
 * have liveness depend on Postgres, or a database blip becomes a rolling restart
 * of every instance at once.
 *
 * The latency is measured from `request_log`, which the interceptors have been
 * writing all along and nothing has ever read. The window is five minutes: long
 * enough to hold samples on a quiet deployment, short enough that the number is
 * about now rather than about the morning.
 */
@Injectable()
export class LivenessService {
  constructor(private readonly em: EntityManager) {}

  async report(): Promise<{
    status: string;
    hostname: string;
    pid: number;
    uptimeSeconds: number;
    latency: {
      windowMinutes: number;
      samples: number;
      avgMs: number | null;
      p95Ms: number | null;
    };
  }> {
    return {
      status: "ok",
      hostname: hostname(),
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      latency: await this.latency(),
    };
  }

  /**
   * Average and p95 response time over the recent window.
   *
   * `deleted_at is null` because this is raw SQL, which does not go through
   * MikroORM's soft-delete filter — without it the maintenance job's pruned
   * rows would still count.
   *
   * A p95 rather than only an average, because an average is exactly the
   * statistic that hides the requests people complain about. `percentile_cont`
   * interpolates, so it is the honest figure for a small sample rather than the
   * nearest real request.
   */
  private async latency(): Promise<{
    windowMinutes: number;
    samples: number;
    avgMs: number | null;
    p95Ms: number | null;
  }> {
    const [row] = await this.em.getConnection().execute<LatencyRow[]>(`
      select
        count(*)::int as samples,
        avg(response_time)::float as avg_ms,
        percentile_cont(0.95) within group (order by response_time)::float as p95_ms
      from request_log
      where created_at > now() - interval '5 minutes'
        and response_time is not null
        and deleted_at is null
    `);

    return {
      windowMinutes: 5,
      samples: row?.samples ?? 0,
      // Null rather than zero when nothing was measured: "no requests" and
      // "instant requests" are different facts and must not look alike.
      avgMs: row?.avg_ms ?? null,
      p95Ms: row?.p95_ms ?? null,
    };
  }
}
