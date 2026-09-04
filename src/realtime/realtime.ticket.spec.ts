import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it } from "vitest";
import { RealtimeTicketService } from "./realtime.ticket";

/**
 * The ticket is the one credential the browser is allowed to hold, so what
 * matters is what it *cannot* do: be an access token, outlive its minute, or
 * open a socket after it has expired.
 */

const SECRET = "test-secret-only-for-this-spec";

function build(expiresIn = "1m") {
  const jwt = new JwtService({ secret: SECRET });
  const config = { getOrThrow: () => expiresIn };

  return {
    jwt,
    service: new RealtimeTicketService(jwt, config as never),
  };
}

describe("RealtimeTicketService", () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it("issues a ticket that resolves back to its owner", async () => {
    const { ticket } = ctx.service.issue("user-1");

    await expect(ctx.service.verify(ticket)).resolves.toBe("user-1");
  });

  it("types the ticket so no REST route will accept it", () => {
    const { ticket } = ctx.service.issue("user-1");

    // The claim name matters: `AuthGuard` reads `payload.type`, and admits only
    // the types a route declares. Nothing declares `realtime`. The type
    // argument is what keeps this assertion honest — `verify` is `any` by
    // default, and an untyped read here would pass whatever it was given.
    const payload = ctx.jwt.verify<{ type?: string }>(ticket);
    expect(payload.type).toBe("realtime");
  });

  it("carries nothing but the user id", () => {
    const { ticket } = ctx.service.issue("user-1");
    const payload = ctx.jwt.verify<Record<string, unknown>>(ticket);

    // No role, no scope, no email. A ticket that leaks must not widen into
    // anything else, and there is nothing here to widen. Asserting the exact
    // key set rather than the absence of a few names means a claim added later
    // fails this test instead of slipping in.
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub", "type"]);
  });

  it("refuses an access token presented as a ticket", async () => {
    // The whole point of a separate type. This token is perfectly valid
    // everywhere else, and must be worthless here.
    const accessToken = ctx.jwt.sign({ sub: "user-1", type: "access" });

    await expect(ctx.service.verify(accessToken)).rejects.toThrow(
      /invalid or expired ticket/i,
    );
  });

  it("refuses a token signed with another key", async () => {
    const other = new JwtService({ secret: "not-the-same-secret" });
    const forged = other.sign({ sub: "user-1", type: "realtime" });

    await expect(ctx.service.verify(forged)).rejects.toThrow(
      /invalid or expired ticket/i,
    );
  });

  it("refuses a ticket that has expired", async () => {
    const expired = ctx.jwt.sign(
      { sub: "user-1", type: "realtime" },
      { expiresIn: "-1s" },
    );

    await expect(ctx.service.verify(expired)).rejects.toThrow(
      /invalid or expired ticket/i,
    );
  });

  it("refuses a realtime-typed token with no subject", async () => {
    const anonymous = ctx.jwt.sign({ type: "realtime" });

    await expect(ctx.service.verify(anonymous)).rejects.toThrow(
      /invalid or expired ticket/i,
    );
  });

  it("reports a lifetime the client can refresh against", () => {
    expect(build("1m").service.issue("u").expiresInSeconds).toBe(60);
    expect(build("45s").service.issue("u").expiresInSeconds).toBe(45);
    expect(build("2h").service.issue("u").expiresInSeconds).toBe(7200);
    // An unparseable value falls back rather than producing NaN, which would
    // make a client refresh immediately, forever.
    expect(build("nonsense").service.issue("u").expiresInSeconds).toBe(60);
  });
});
