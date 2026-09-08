import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { AppLoggerService } from "@/infra/logger/logger.service";
import {
  RequestIdInterceptor,
  REQUEST_ID_HEADER,
} from "./request-id.interceptor";

/** Mocks are held as named locals rather than read off the object they are put
 *  on: passing a method reference into `expect` detaches it from its `this`, and
 *  `@typescript-eslint/unbound-method` is right to complain. */
function makeLogger() {
  const log = vi.fn();
  const logRequest = vi.fn();

  return {
    logger: {
      log,
      logRequest,
      error: vi.fn(),
    } as unknown as AppLoggerService,
    log,
    logRequest,
  };
}

function makeReflector(skip: boolean) {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(skip),
  } as unknown as Reflector;
}

function makeContext() {
  const request: Record<string, unknown> = {
    method: "GET",
    url: "/",
    headers: {},
  };
  const header = vi.fn();

  const context = {
    getType: () => "http",
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header, statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;

  return { context, request, header };
}

const next = { handle: () => of("ok") } as CallHandler;

describe("RequestIdInterceptor", () => {
  it("assigns an id and sets the header", async () => {
    const { logger } = makeLogger();
    const { context, request, header } = makeContext();

    await lastValueFrom(
      new RequestIdInterceptor(logger, makeReflector(false)).intercept(
        context,
        next,
      ),
    );

    expect(request.requestId).toEqual(expect.any(String));
    expect(header).toHaveBeenCalledWith(REQUEST_ID_HEADER, request.requestId);
  });

  it("still assigns the id on a route that opted out of logging", async () => {
    // The id is not logging. `ResponseInterceptor` and `GlobalExceptionFilter`
    // both read it, so a silent route with no id would answer "unknown".
    const { logger } = makeLogger();
    const { context, request, header } = makeContext();

    await lastValueFrom(
      new RequestIdInterceptor(logger, makeReflector(true)).intercept(
        context,
        next,
      ),
    );

    expect(request.requestId).toEqual(expect.any(String));
    expect(header).toHaveBeenCalled();
  });

  it("writes no log lines on a route that opted out", async () => {
    // What a fifteen-second scrape would otherwise produce, all day.
    const { logger, log, logRequest } = makeLogger();
    const { context } = makeContext();

    await lastValueFrom(
      new RequestIdInterceptor(logger, makeReflector(true)).intercept(
        context,
        next,
      ),
    );

    expect(log).not.toHaveBeenCalled();
    expect(logRequest).not.toHaveBeenCalled();
  });

  it("does log an ordinary request", async () => {
    const { logger, log, logRequest } = makeLogger();
    const { context } = makeContext();

    await lastValueFrom(
      new RequestIdInterceptor(logger, makeReflector(false)).intercept(
        context,
        next,
      ),
    );

    expect(log).toHaveBeenCalled();
    expect(logRequest).toHaveBeenCalled();
  });
});
