import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthCheckService, MikroOrmHealthIndicator } from "@nestjs/terminus";
import type { FastifyReply } from "fastify";
import { Public } from "@/common/decorators/auth.decorator";
import { SkipLogging } from "@/common/decorators/auth.decorator";
import { LivenessService } from "./liveness.service";
import { QueueHealthIndicator } from "./queue.health";
import { RedisHealthIndicator } from "./redis.health";

/**
 * The two questions an orchestrator asks, kept apart on purpose.
 *
 * `GET /health` — *is this process alive?* It answers from memory and one query
 * against its own request log, and touches no dependency. A liveness probe that
 * fails when Postgres is down is a probe that restarts every instance at once,
 * during the one incident where restarting is the worst thing to do.
 *
 * `GET /health/ready` — *should this process receive traffic?* Here the
 * dependencies are the whole point, so it probes Postgres, Redis and the queues,
 * each with its own timeout, and answers 503 when any of them is down.
 *
 * Both sit outside the application's own surface deliberately — see the note in
 * `observability.module.ts` — and opt out of the pipeline accordingly:
 * `@Public()` for the guard, `@SkipThrottle()` for the limiter, `@SkipLogging()`
 * so a probe every thirty seconds does not fill `request_log`, and `@Res()` so
 * the body is not wrapped in the REST envelope. Prometheus and container
 * runtimes do not read `{ success: true, data: … }`.
 *
 * `docker-compose.uat.yml` has been probing `GET /health` every thirty seconds
 * since it was written, against a route that did not exist. This is that route.
 */
@ApiTags("Health")
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: MikroOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly queues: QueueHealthIndicator,
    private readonly liveness: LivenessService,
    private readonly config: ConfigService,
  ) {}

  @Get("health")
  @Public()
  @SkipThrottle()
  @SkipLogging()
  @ApiOperation({ summary: "Liveness: this process is running" })
  async live(@Res() reply: FastifyReply): Promise<void> {
    this.send(reply, 200, await this.liveness.report());
  }

  @Get("health/ready")
  @Public()
  @SkipThrottle()
  @SkipLogging()
  @ApiOperation({ summary: "Readiness: the dependencies answer" })
  async ready(@Res() reply: FastifyReply): Promise<void> {
    const timeout =
      this.config.get<number>("observability.probeTimeoutMs") ?? 2000;

    // `check()` **throws** `ServiceUnavailableException` when a probe is down
    // rather than returning a failed result — the executor raises it with its
    // own payload as the response. Left uncaught that reaches
    // `GlobalExceptionFilter`, which wraps it in the REST envelope and hands
    // Prometheus and container runtimes a body shaped for a browser client.
    // So the throw is caught here and the payload sent as it stands.
    try {
      const result = await this.health.check([
        () => this.database.pingCheck("database", { timeout }),
        () => this.redis.check("redis", timeout),
        () => this.queues.check("queues", timeout),
      ]);

      this.send(reply, 200, result);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;

      // 503 and not 200-with-an-error-body: the status code is what a container
      // runtime or a load balancer acts on, and both read a 200 as healthy.
      this.send(reply, 503, error.getResponse());
    }
  }

  /** One place the two endpoints answer, so neither can drift into the
   *  envelope the rest of the API uses. */
  private send(reply: FastifyReply, status: number, body: unknown): void {
    void reply
      .status(status)
      .header("content-type", "application/json; charset=utf-8")
      // A cached health answer is worse than none: the whole question is
      // whether the thing is answering *now*.
      .header("cache-control", "no-store")
      .send(JSON.stringify(body));
  }
}
