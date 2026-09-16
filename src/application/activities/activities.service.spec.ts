import type { RequestUserType } from "@/common/types/request.type";
import type { EntityManager } from "@mikro-orm/postgresql";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ActivitiesService } from "./activities.service";
import type { ActivitiesListDTO } from "./dto/activities-list.dto";

/**
 * No EntityManager is exercised: every case here is refused before a query is
 * built, which is the property being tested. That the stub is empty is the
 * point — if a case below starts reaching for the database, it has stopped
 * being an authorization test.
 */
const em = {} as unknown as EntityManager;

const USER = { id: "u1" } as unknown as RequestUserType;

function dto(query: Partial<ActivitiesListDTO> = {}): ActivitiesListDTO {
  return { limit: 10, ...query } as ActivitiesListDTO;
}

function service() {
  return new ActivitiesService(em);
}

describe("ActivitiesService.getActivities", () => {
  /**
   * The half of the pairing held by `activities-list.dto.spec.ts`.
   *
   * `where` is built from the context, so a call without one is not a broader
   * list — it is `em.find(Activity, {})`, every user's activity with actor
   * names. The DTO refuses that request at the edge, but a service that only
   * refuses it when the caller remembers the decorators are missing is one
   * refactor away from returning it.
   */
  it("refuses a call with no context rather than listing everything", async () => {
    await expect(service().getActivities(USER, dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service().getActivities(USER, dto({ contextType: "USER" })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service().getActivities(USER, dto({ contextId: "u1" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses someone else's context", async () => {
    await expect(
      service().getActivities(
        USER,
        dto({ contextType: "USER", contextId: "someone-else" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a context type it has no access rule for", async () => {
    // `verifyContextAccess` switches on USER and rejects the rest, so the
    // future-facing entries in CONTEXT_TYPES are not quietly readable.
    await expect(
      service().getActivities(
        USER,
        dto({ contextType: "SYSTEM", contextId: "u1" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
