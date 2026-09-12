import { Controller, Get, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import { Public, SkipLogging } from "@/common/decorators/auth.decorator";
import { MetricsService } from "@/infra/metrics/metrics.service";

/**
 * The Prometheus scrape target.
 *
 * Unauthenticated, like `/health`, and that is a considered choice rather than
 * an omission: Prometheus's scrape config can send a bearer token, but a
 * deployment that keeps this port internal gets nothing from one, and the
 * metrics themselves leak route names, error rates and traffic volume — never a
 * credential or a reader's data. If this port is ever published, put it behind
 * `METRICS_ENABLED=false`, a network policy, or both.
 *
 * `@Res()` because the body is the exposition format: a plain-text body, not
 * JSON, and certainly not the REST envelope every other route in this
 * application answers with.
 */
@ApiTags("Health")
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get("metrics")
  @Public()
  @SkipThrottle()
  @SkipLogging()
  @ApiOperation({ summary: "Prometheus metrics" })
  async scrape(@Res() reply: FastifyReply): Promise<void> {
    if (!this.config.get<boolean>("observability.metricsEnabled")) {
      // 404 rather than 403: an endpoint that has been switched off is not
      // there, and a 403 would confirm to a scanner that it exists.
      void reply.status(404).send();
      return;
    }

    const { body, contentType } = await this.metrics.render();

    void reply
      .status(200)
      .header("content-type", contentType)
      .header("cache-control", "no-store")
      .send(body);
  }
}
