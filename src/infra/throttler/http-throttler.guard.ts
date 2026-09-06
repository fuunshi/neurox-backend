import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * The throttler, scoped to HTTP.
 *
 * `ThrottlerGuard` writes `X-RateLimit-*` headers onto the response, so it
 * assumes an HTTP exchange. A global guard also runs for WebSocket messages,
 * and there `switchToHttp().getResponse()` is the *message payload* rather than
 * a reply — so `handleRequest` threw `res.header is not a function` and every
 * `subscribe` died before its handler ran.
 *
 * Skipping the socket is also the right policy, not merely a way to stop the
 * crash: a connection already passed the HTTP limiter when it minted its
 * ticket, which is the request that could be abused. Per-message throttling
 * would be a different rule with a different window — subscribe/unsubscribe
 * churn — and inventing one here would silently apply the HTTP budget to it.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    return super.canActivate(context);
  }
}
