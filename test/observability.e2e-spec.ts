import { AppModule } from "@/app.module";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { EntityManager } from "@mikro-orm/postgresql";
import type { Server } from "http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Health, against a running server.
 *
 * The assertion that matters here is the *absence* of the REST envelope. Every
 * other route in this application answers
 * `{ success, statusCode, message, data, requestId, timestamp }`, because
 * `ResponseInterceptor` is global — and a container runtime reads neither that
 * shape nor a 200 that means "actually broken". These routes opt out of that
 * pipeline deliberately, so what these tests hold is that the opt-out is still
 * there.
 *
 * Needs PostgreSQL and Redis, like the other e2e specs.
 */
describe("Observability routes (e2e)", () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await Promise.race([
      Promise.resolve(app?.close()).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }, 30_000);

  it("answers liveness without the REST envelope", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    // Supertest types `body` as `any`; naming the shape here keeps the casts out
    // of the assertions, which the lint rules will not let us make otherwise.
    const body = res.body as {
      status: string;
      hostname: string;
      uptimeSeconds: number;
      latency: { samples: number };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.hostname).toEqual(expect.any(String));
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(typeof body.latency.samples).toBe("number");

    // The envelope is the thing this route exists to avoid.
    expect(res.body).not.toHaveProperty("success");
    expect(res.body).not.toHaveProperty("requestId");
  });

  it("answers readiness with terminus's own shape", async () => {
    const res = await request(app.getHttpServer()).get("/health/ready");
    const body = res.body as {
      status: string;
      details: Record<string, { status: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    // Terminus's vocabulary rather than ours: `details` keyed per indicator.
    expect(body.details.database?.status).toBe("up");
    expect(body.details.redis?.status).toBe("up");
    expect(body.details.queues?.status).toBe("up");
    expect(res.body).not.toHaveProperty("success");
  });

  it("does not persist a probe as application traffic", async () => {
    // `@SkipLogging()` is what keeps a thirty-second probe from burying the rows
    // that describe what readers did. Counted by path rather than in total,
    // because the counting query goes over HTTP too and writes its own row.
    const before = await healthLogs();

    await request(app.getHttpServer()).get("/health");
    await request(app.getHttpServer()).get("/health/ready");

    // The write is fire-and-forget, so it would land a tick later if it landed.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(await healthLogs()).toBe(before);
  });

  async function healthLogs(): Promise<number> {
    const em = app.get(EntityManager);
    const [row] = await em
      .getConnection()
      .execute<CountRow[]>(HEALTH_LOG_COUNT_SQL);

    return row?.count ?? 0;
  }
});

const HEALTH_LOG_COUNT_SQL =
  "select count(*)::int as count from request_log where path like '/health%'";

interface CountRow {
  count: number;
}
