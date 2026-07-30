import { AppModule } from "@/app.module";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Boots the real `AppModule`, so this exercises the whole composition root:
 * configuration, MikroORM, Redis/BullMQ, the global guard/interceptor/filter
 * chain, and route registration.
 *
 * Requires PostgreSQL and Redis to be reachable, and `JWT_SECRET`,
 * `DATABASE_URL` and `TOKEN_HASH_SECRET` to be set -- they are read with
 * `getOrThrow`, so a missing one fails here rather than at first use.
 */
describe("AppModule (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // `app.close()` does not resolve here: it waits on teardown that never
    // completes (see the note in vitest.e2e.config.mts). Racing it keeps the
    // suite from hanging on it, and the process exits once the run finishes.
    await Promise.race([
      Promise.resolve(app?.close()).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }, 20_000);

  it("boots with the whole module graph resolved", () => {
    // Reaching this point means every provider resolved. The MikroORM
    // migration already produced one bug that compiled cleanly but broke DI at
    // boot, so this assertion is not a formality.
    expect(app).toBeDefined();
  });

  it("serves the unauthenticated root route through the response envelope", async () => {
    // `app.init()` does not bind a port; supertest drives the underlying server
    // directly, so no port needs to be free.
    const res = await request(app.getHttpServer()).get("/");

    expect(res.status).toBe(200);

    // Shape asserted by ResponseInterceptor (ARCHITECTURE.md §6).
    expect(res.body).toMatchObject({ success: true, statusCode: 200 });
    expect(res.body).toHaveProperty("requestId");
    expect(res.body).toHaveProperty("timestamp");
  });
});
