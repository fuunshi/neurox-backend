import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { Observable, catchError, tap } from "rxjs";
import { SKIP_LOGGING_KEY } from "@/common/decorators/auth.decorator";
import { MetricsService } from "@/infra/metrics/metrics.service";

/**
 * Counts every request, and times it.
 *
 * ## The label is a pattern, not a URL
 *
 * This is the one thing that has to be right or the endpoint destroys itself. A
 * Prometheus series is a distinct label combination held in the server's memory
 * for as long as it is scraped, so labelling by URL would mint a new series for
 * every deck id, card id and pagination cursor that passed through — tens of
 * thousands a week, each of them one request wide. The route *pattern*
 * (`/decks/:id/study`) is bounded by the number of routes that exist.
 *
 * The pattern comes from Nest's own route metadata rather than from Fastify, so
 * it works the same under the Express adapter the e2e tests boot.
 *
 * Failing requests are recorded too, with the status they failed as: an error
 * rate you cannot see is not being measured.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // A socket message is not an HTTP request and has no route to be labelled by.
    if (context.getType() !== "http") return next.handle();

    // The same predicate that keeps infrastructure out of the request log: a
    // scrape measuring itself would make the scrape the busiest route on the
    // dashboard, and a healthcheck every thirty seconds is not traffic.
    const infrastructure = this.reflector.getAllAndOverride<boolean>(
      SKIP_LOGGING_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (infrastructure) return next.handle();

    const request = context.switchToHttp().getRequest<{ method: string }>();
    const response = context.switchToHttp().getResponse<{
      statusCode: number;
    }>();
    const route = routePattern(this.reflector, context);
    // A monotonic clock, because this measures a duration and `Date.now` can
    // step backwards when the host's clock is corrected.
    const startedAt = process.hrtime.bigint();

    const record = (status: number): void => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.observeHttp(request.method, route, status, seconds);
    };

    return next.handle().pipe(
      tap(() => record(response.statusCode)),
      catchError((error: unknown) => {
        record(error instanceof HttpException ? error.getStatus() : 500);
        throw error;
      }),
    );
  }
}

/**
 * The pattern a handler is mounted at, from Nest's route metadata.
 *
 * `PATH_METADATA` holds the controller prefix and the method path separately —
 * and either can be an array, since Nest allows a handler to answer several
 * paths — so they are joined the way the router joins them. A route with no
 * metadata at all resolves to `"unknown"` rather than to an empty label, so it
 * is visible rather than merged into every other unnamed series.
 *
 * Exported for its own test. The property it protects — that a series is bounded
 * by the number of routes rather than by the number of ids — cannot be asserted
 * through the endpoint without an authenticated request per id.
 */
export function routePattern(
  reflector: Reflector,
  context: ExecutionContext,
): string {
  const declared = [
    reflector.get<string | string[]>(PATH_METADATA, context.getClass()),
    reflector.get<string | string[]>(PATH_METADATA, context.getHandler()),
  ];

  const segments = declared
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      return value === undefined ? [] : [value];
    })
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .filter((part) => part.length > 0);

  if (segments.length === 0) {
    // No segments means the handler is mounted at the root — `@Get()` on a
    // controller with no prefix. Reporting "unknown" there would be a lie about
    // a route this knows exactly, and would merge it with any genuinely
    // unlabelled one.
    return declared.some(Boolean) ? "/" : "unknown";
  }

  return `/${segments.join("/")}`;
}
