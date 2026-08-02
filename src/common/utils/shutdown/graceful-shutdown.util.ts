import {
  INestApplication,
  INestApplicationContext,
  Logger,
} from "@nestjs/common";

/**
 * Minimal logger surface, so both Nest's `Logger` and the application's
 * `AppLoggerService` satisfy it. Nest 12's `Logger` type is not assignable from
 * the app logger, and narrowing to what is actually used avoids a cast.
 */
export interface ShutdownLogger {
  log(message: string): unknown;
  error(message: string): unknown;
}

export interface GracefulShutdownOptions {
  /** How long in-flight work is allowed to finish before a forced exit. */
  timeoutMs?: number;
  logger?: ShutdownLogger;
}

interface ClosableServer {
  close?: (cb?: () => void) => void;
  closeIdleConnections?: () => void;
}

/**
 * Registers SIGTERM/SIGINT handlers that drain the process before exiting.
 *
 * Why this does not simply call `app.close()`:
 *
 * `app.close()` (and `MikroORM.close()`, including the forced variant) does not
 * resolve once the process has served at least one HTTP request. With no
 * requests it resolves immediately. This was measured, not assumed -- see the
 * note in ARCHITECTURE.md. There is no connection leak: the Postgres backend
 * count settles at the pool size and stays there no matter how many requests
 * are served, so this affects shutdown only.
 *
 * Waiting on `app.close()` would therefore hang every deploy until the
 * orchestrator sent SIGKILL. Instead this stops accepting new connections,
 * lets in-flight requests finish, and exits -- with a hard timeout as the
 * backstop so a stubborn connection can never wedge a deploy.
 */
export function enableGracefulShutdown(
  app: INestApplication | INestApplicationContext,
  options: GracefulShutdownOptions = {},
): void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const logger = options.logger ?? new Logger("GracefulShutdown");

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    // A second signal (or SIGINT after SIGTERM) should not restart the process.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log(`Received ${signal}; draining (grace period ${timeoutMs}ms)`);

    const forced = setTimeout(() => {
      logger.error(
        `Graceful shutdown exceeded ${timeoutMs}ms; forcing exit. In-flight work may have been dropped.`,
      );
      process.exit(1);
    }, timeoutMs);
    // Do not let the timer itself hold the event loop open.
    forced.unref();

    const exitCleanly = (): void => {
      clearTimeout(forced);
      logger.log("Shutdown complete");
      process.exit(0);
    };

    // The HTTP app exposes a server; the worker does not, so this is optional.
    const server = (app as INestApplication).getHttpServer?.() as
      | ClosableServer
      | undefined;

    if (server?.close) {
      // Stop accepting new connections, then resolve once existing ones end.
      // Idle keep-alive sockets are dropped so `close` can actually fire.
      server.close(() => exitCleanly());
      server.closeIdleConnections?.();
      return;
    }

    // No server (worker process): give in-flight jobs a moment, then exit.
    setTimeout(exitCleanly, Math.min(timeoutMs, 2_000)).unref();
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => shutdown(signal));
  }
}
