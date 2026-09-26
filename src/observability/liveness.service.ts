import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { hostname } from "node:os";

interface LatencyRow {
  samples: number;
  avg_ms: number | null;
  p95_ms: number | null;
}

interface Latency {
  windowMinutes: number;
  samples: number;
  avgMs: number | null;
  p95Ms: number | null;
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
  private readonly logger = new Logger(LivenessService.name);

  constructor(private readonly em: EntityManager) {}

  async report(): Promise<{
    status: string;
    hostname: string;
    pid: number;
    uptimeSeconds: number;
    latency: Latency;
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
  private async latency(): Promise<Latency> {
    try {
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
    } catch (error) {
      /*
       * The measurement is best-effort, and this catch is what makes liveness
       * trustworthy rather than what weakens it.
       *
       * `request_log` is a Postgres table, so reading it makes this endpoint
       * depend on Postgres — the one thing the contract above says liveness
       * must never do. Unguarded, a database that is down turns `GET /health`
       * into a 500, and an orchestrator reading that restarts every instance
       * during the exact incident where restarting is the worst thing to do.
       * It also breaks the UAT healthcheck, which probes this route *because*
       * it is meant to survive a database that is not ready — and on a fresh
       * volume it never is, since migrations are applied explicitly and never
       * on boot.
       *
       * So the process still reports itself alive and the number degrades to
       * "not measured": `null` is already how this shape says that, so nothing
       * downstream learns a new case. Whether Postgres is reachable is
       * readiness's question, and it answers it with a 503.
       *
       * Logged, because the failure has a cause readiness cannot see: a
       * reachable database whose migrations have not run pings as "up" while
       * the table this needs is missing. That combination is otherwise silent.
       */
      this.logger.warn(
        `Request-log latency unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );

      return { windowMinutes: 5, samples: 0, avgMs: null, p95Ms: null };
    }
  }
}
