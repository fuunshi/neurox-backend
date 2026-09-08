import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { RequestLogInterceptor } from "./request-log.interceptor";

/** Named locals rather than reading the mocks off the object they are placed
 *  on — see the note in `request-id.interceptor.spec.ts`. */
function makeEm() {
  const create = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);

  return {
    em: { create, flush, getReference: vi.fn() } as unknown as EntityManager,
    create,
    flush,
  };
}

function makeReflector(skip: boolean) {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(skip),
  } as unknown as Reflector;
}

function makeContext(type: "http" | "ws" = "http") {
  return {
    getType: () => type,
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        method: "GET",
        url: "/decks",
        headers: {},
        ip: "127.0.0.1",
      }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

const next = { handle: () => of("ok") } as CallHandler;

describe("RequestLogInterceptor", () => {
  it("persists an ordinary request", async () => {
    const { em, create, flush } = makeEm();

    await lastValueFrom(
      new RequestLogInterceptor(em, makeReflector(false)).intercept(
        makeContext(),
        next,
      ),
    );

    // The write is fire-and-forget, so it lands a tick after the response.
    await vi.waitFor(() => expect(flush).toHaveBeenCalled());
    expect(create).toHaveBeenCalled();
  });

  it("persists nothing for a route that opted out", async () => {
    // A scrape every fifteen seconds is 5,760 rows a day describing nobody.
    const { em, create, flush } = makeEm();

    await lastValueFrom(
      new RequestLogInterceptor(em, makeReflector(true)).intercept(
        makeContext(),
        next,
      ),
    );

    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it("persists nothing for a socket message", async () => {
    // There is no Fastify request on a WebSocket message, and a socket is not a
    // request — this table is not where it belongs.
    const { em, create } = makeEm();

    await lastValueFrom(
      new RequestLogInterceptor(em, makeReflector(false)).intercept(
        makeContext("ws"),
        next,
      ),
    );

    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });
});
