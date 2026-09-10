import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HealthIndicatorService } from "@nestjs/terminus";
import { Redis } from "ioredis";

/**
 * Redis, as the application actually reaches it.
 *
 * Deliberately *not* built on `RedisService`. That client is configured from
 * `REDIS_URL`, which in this project's `.env` names the docker-compose service
 * (`redis`) while everything real uses `REDIS_HOST`/`REDIS_PORT` — the same
 * split `BullModule` reads. So `RedisService` cannot resolve a host on a
 * machine that is not inside compose, and a readiness probe built on it would
 * report a down dependency the app never touches. This uses the same
 * configuration BullMQ does, so the answer means what it says.
 *
 * Terminus ships no Redis indicator (it covers TypeORM, Prisma, Mongoose,
 * Sequelize, MikroORM and gRPC), so this is built on its
 * `HealthIndicatorService`, which supplies the result shape and the timeout.
 *
 * A connection per check rather than a long-lived one: a probe runs every
 * thirty seconds, `disconnect` leaves nothing to clean up on shutdown, and the
 * measured thing is whether a connection can be *made* right now.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly config: ConfigService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  check(key: string, timeoutMs: number) {
    return this.indicators
      .check(key)
      .attempt(async () => {
        const client = new Redis({
          host: this.config.get<string>("redis.host") || "localhost",
          port: this.config.get<number>("redis.port") || 6379,
          password: this.config.get<string>("redis.password") || undefined,
          // Both of these exist so a check fails fast instead of queueing the
          // command until the server returns: the question is whether Redis is
          // there *now*, and a buffered `ping` would answer eventually and look
          // like health.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });

        // ioredis reports connection failures as an `error` event, and an
        // unhandled one takes the process down. The `connect()` below rejects
        // with the same failure, which is the path this check reports on.
        client.on("error", () => {});

        try {
          await client.connect();
          return { ping: await client.ping() };
        } finally {
          client.disconnect();
        }
      })
      .withTimeout(timeoutMs);
  }
}
