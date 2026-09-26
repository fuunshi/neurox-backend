import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ActivitiesListDTO } from "./activities-list.dto";

/**
 * The pipe as the application installs it (`app.module.ts`), so these assertions
 * are about the validation the API actually performs rather than about
 * class-validator in the abstract.
 */
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: false },
});

/** `transform` is typed `any`; the assertion is what keeps that out of the
 *  assertions below, which the lint rules require. */
async function accepts(query: Record<string, unknown>) {
  try {
    const dto = (await pipe.transform(query, {
      type: "query",
      metatype: ActivitiesListDTO,
    })) as ActivitiesListDTO;

    return { ok: true as const, dto };
  } catch {
    return { ok: false as const, dto: null };
  }
}

describe("ActivitiesListDTO", () => {
  it("accepts the call the app actually makes", async () => {
    const { ok, dto } = await accepts({
      contextType: "USER",
      contextId: "u1",
      limit: "30",
    });

    expect(ok).toBe(true);
    expect(dto).toBeInstanceOf(ActivitiesListDTO);
  });

  /**
   * The assertion this file exists for.
   *
   * `contextType` and `contextId` are the only pair in this DTO without
   * `@IsOptional()`. That looks like an inconsistency worth tidying, and it is
   * the opposite: `ActivitiesService.getActivities` scopes its query by the
   * context, so a request carrying neither must not reach it. Removing these
   * expectations is only safe alongside a service that refuses the call itself
   * — which it now does, and `activities.service.spec.ts` holds that half.
   */
  it("refuses a call that names no context", async () => {
    expect((await accepts({})).ok).toBe(false);
    expect((await accepts({ limit: "30" })).ok).toBe(false);
  });

  it("refuses half a context", async () => {
    // Both halves are the scope; either one alone is not a narrower question,
    // it is an unscoped one.
    expect((await accepts({ contextType: "USER" })).ok).toBe(false);
    expect((await accepts({ contextId: "u1" })).ok).toBe(false);
  });

  it("knows the difference between a context type and a permitted one", async () => {
    // The DTO's business is shape; access is the service's. So a context type
    // that exists in the enum but has no access rule passes here and is refused
    // there — asserting the split, because collapsing it would put an
    // authorization decision in a validation decorator.
    expect(
      (await accepts({ contextType: "ORGANIZATION", contextId: "o1" })).ok,
    ).toBe(true);
    expect(
      (await accepts({ contextType: "NOT_A_CONTEXT", contextId: "o1" })).ok,
    ).toBe(false);
  });

  it("still bounds the page size", async () => {
    const base = { contextType: "USER", contextId: "u1" };

    expect((await accepts({ ...base, limit: "51" })).ok).toBe(false);
    expect((await accepts({ ...base, limit: "0" })).ok).toBe(false);
    expect((await accepts({ ...base, limit: "50" })).ok).toBe(true);
  });

  it("refuses a parameter it does not know", async () => {
    // `forbidNonWhitelisted` is what turns a typo into a 400 rather than a
    // silently ignored filter.
    expect(
      (await accepts({ contextType: "USER", contextId: "u1", actor: "u2" })).ok,
    ).toBe(false);
  });
});
