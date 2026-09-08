import { SetMetadata } from "@nestjs/common";
import { JwtTokenType } from "../types/token.type";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_TOKEN_TYPES_KEY = "allow_token_types";
export const AllowTokenTypes = (...types: JwtTokenType[]) =>
  SetMetadata(ALLOW_TOKEN_TYPES_KEY, types);

/**
 * Marks a route as infrastructure rather than application traffic.
 *
 * Prometheus scrapes and container healthchecks arrive on timers — fifteen and
 * thirty seconds respectively — so logging them as requests would write several
 * thousand rows a day into `request_log`, none of which describe anything a
 * person did. It also keeps them out of the request log's latency figures, which
 * are supposed to describe the API's response to a reader.
 *
 * The same metadata idiom the rest of the request pipeline opts out with:
 * `@Public()` for the guard, the throttler's own `@SkipThrottle()`.
 *
 * It suppresses *logging* only. `RequestIdInterceptor` still assigns the id and
 * sets the header, because `ResponseInterceptor` and `GlobalExceptionFilter`
 * both read it and a route with no id would answer `"unknown"`.
 */
export const SKIP_LOGGING_KEY = "skipLogging";
export const SkipLogging = () => SetMetadata(SKIP_LOGGING_KEY, true);
