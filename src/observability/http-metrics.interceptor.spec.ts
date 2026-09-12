import type { ExecutionContext } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { routePattern } from "./http-metrics.interceptor";

/**
 * The route pattern a metric is labelled by.
 *
 * This is the one thing in the metrics wiring that has to be exactly right: a
 * Prometheus series is held in the server's memory for as long as it is scraped,
 * so a label carrying an id mints a new series per id and the endpoint destroys
 * itself. Asserted here rather than through `/metrics` because doing it over HTTP
 * would need an authenticated request per id, which is the very thing being
 * guarded against.
 */

const controller = {};
const handler = {};

function context(): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

/** Stands in for `Reflector.get`, which reads metadata the decorators wrote. */
function reflectorFor(
  controllerPath: unknown,
  handlerPath: unknown,
): Reflector {
  const values = new Map<unknown, unknown>([
    [controller, controllerPath],
    [handler, handlerPath],
  ]);

  return {
    get: (key: string, target: unknown) =>
      key === PATH_METADATA ? values.get(target) : undefined,
  } as unknown as Reflector;
}

describe("routePattern", () => {
  it("joins the controller prefix to the handler path", () => {
    const pattern = routePattern(
      reflectorFor("notifications", ":id/read"),
      context(),
    );

    expect(pattern).toBe("/notifications/:id/read");
  });

  it("keeps the parameter placeholder rather than substituting anything", () => {
    // The whole point. `/decks/8f3a…/study` and `/decks/1b7c…/study` must be
    // one series, not two.
    const pattern = routePattern(
      reflectorFor("decks", ":deckId/study"),
      context(),
    );

    expect(pattern).toBe("/decks/:deckId/study");
    expect(pattern).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("reports the root route as / rather than as unknown", () => {
    // `@Controller()` with `@Get()` — a route we know exactly, so "unknown"
    // would be wrong and would merge it with any genuinely unlabelled one.
    expect(routePattern(reflectorFor("/", undefined), context())).toBe("/");
  });

  it("handles a controller with no prefix and a bare path", () => {
    expect(routePattern(reflectorFor("/", "decks"), context())).toBe("/decks");
  });

  it("joins every path when a handler answers several", () => {
    // Nest allows an array; the joined form is what the router mounts.
    const pattern = routePattern(
      reflectorFor("decks", ["export", "csv"]),
      context(),
    );

    expect(pattern).toBe("/decks/export/csv");
  });

  it("normalises stray slashes rather than doubling them", () => {
    expect(routePattern(reflectorFor("/decks/", "/:id/"), context())).toBe(
      "/decks/:id",
    );
  });

  it("says unknown when there is no route metadata at all", () => {
    expect(routePattern(reflectorFor(undefined, undefined), context())).toBe(
      "unknown",
    );
  });
});
