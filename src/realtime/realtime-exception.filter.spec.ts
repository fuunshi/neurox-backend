import { ArgumentsHost } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";
import { RealtimeExceptionFilter } from "./realtime-exception.filter";
import { SERVER_EVENTS } from "./realtime.types";

/**
 * The host Nest hands a filter for a socket message: `switchToWs()`, not
 * `switchToHttp()`. `getPattern`/`getData` are only read by the base class's
 * path, which the `WsException` case delegates to.
 */
function wsHost(client: Partial<Socket>): ArgumentsHost {
  return {
    switchToWs: () => ({
      getClient: () => client,
      getPattern: () => "subscribe",
      getData: () => ({ topic: "deck:00000000-0000-0000-0000-000000000000" }),
    }),
  } as unknown as ArgumentsHost;
}

/** A socket whose `emit` is a spy, so a test can assert what the client heard.
 *  The signature is spelled out because an untyped `vi.fn()` is `any`, which the
 *  lint rules refuse to pass into `expect`. */
function socketWithSpy() {
  const emit = vi.fn<(event: string, payload: unknown) => void>();

  return {
    client: { id: "socket-1", emit } as unknown as Partial<Socket>,
    emit,
  };
}

describe("RealtimeExceptionFilter", () => {
  it("answers a failed message on the event clients actually handle", () => {
    const { client, emit } = socketWithSpy();

    new RealtimeExceptionFilter().catch(new Error("boom"), wsHost(client));

    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, {
      message: "Something went wrong.",
    });
  });

  it("keeps the internal message out of the client's hands", () => {
    const { client, emit } = socketWithSpy();

    new RealtimeExceptionFilter().catch(
      new Error('relation "deck" does not exist'),
      wsHost(client),
    );

    // Read the payload rather than matching through `expect.stringContaining`:
    // the matcher is typed `any`, and the lint rules refuse that inside
    // `objectContaining`.
    const payload = emit.mock.calls[0]?.[1] as { message?: string } | undefined;

    expect(payload?.message ?? "").not.toContain("relation");
  });

  it("leaves a WsException to the base filter, whose message is meant for the caller", () => {
    // A WsException is a deliberate refusal — "Not allowed to subscribe to that."
    // — so its message must survive, unlike an unexpected error's.
    const { client, emit } = socketWithSpy();

    new RealtimeExceptionFilter().catch(
      new WsException("Not allowed to subscribe to that."),
      wsHost(client),
    );

    expect(emit).toHaveBeenCalledWith(
      "exception",
      expect.objectContaining({
        status: "error",
        message: "Not allowed to subscribe to that.",
      }),
    );
  });
});
