import { ArgumentsHost, Catch, Logger } from "@nestjs/common";
import { BaseWsExceptionFilter, WsException } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import { SERVER_EVENTS } from "./realtime.types";

/**
 * Failures inside a socket handler.
 *
 * A global filter cannot cover this surface. Nest's WebSocket filter context
 * returns an empty `getGlobalMetadata()`, so an `APP_FILTER` — including this
 * project's `GlobalExceptionFilter` — is never applied to a message; the only
 * filter a gateway gets is one declared on it. That left every socket error to
 * Nest's default, which logged it to pino as `{}` — no message, no stack — and
 * answered on an `exception` event no client listens for. A failing `subscribe`
 * was invisible for exactly that reason, and diagnosing one meant patching
 * Nest's own classes to see the error at all.
 *
 * So this supplies the two things that were missing: the detail in the log, and
 * an answer on the event clients actually handle.
 */
@Catch()
export class RealtimeExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(RealtimeExceptionFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    // A `WsException` is a deliberate refusal carrying a message written for
    // the caller, so the base class's handling is right for it — flattening it
    // into the generic answer below would throw that message away.
    if (exception instanceof WsException) {
      super.catch(exception, host);
      return;
    }

    const client = host.switchToWs().getClient<Socket>();
    const message =
      exception instanceof Error ? exception.message : String(exception);

    // Both arguments are strings, which is the part the default got wrong: it
    // handed pino an object with no serialiser and the line came out `{}`.
    this.logger.error(
      `Socket ${client?.id ?? "unknown"} failed a message: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Deliberately generic. The detail belongs in the log, not in a client's
    // hands — the same rule the HTTP filter's unknown-error branch follows.
    client?.emit(SERVER_EVENTS.ERROR, { message: "Something went wrong." });
  }
}
