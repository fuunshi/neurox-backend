import { TOKEN_TYPE, type JwtTokenType } from "@/common/types/token.type";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

/**
 * The credential a socket presents when it opens.
 *
 * ## Why a ticket rather than the session
 *
 * Every other request in this system is authenticated by the reader's httpOnly
 * session cookie, which the browser cannot read and therefore cannot leak. A
 * WebSocket handshake does not carry that, because the socket does not go
 * through the front end's own origin — Next.js route handlers cannot hold a
 * WebSocket (see the front end's README), so the socket connects to this API
 * directly.
 *
 * So the front end mints a ticket from the session it already holds and hands
 * **that** to the browser. Three properties keep it from being a session token
 * in disguise:
 *
 *  1. It expires in a minute, and the client asks for a new one per connection.
 *  2. It is typed `REALTIME`, and `AuthGuard` only admits the types a route
 *     declares — no route declares this one. Presenting it as a bearer token to
 *     `/decks` is a 401, not access.
 *  3. It carries nothing but the user id. No role, no scope, nothing that would
 *     widen if it leaked.
 *
 * The alternative — sending the real access token — would put a full session
 * credential in JavaScript, which is the exact thing the front end's design
 * exists to avoid.
 */

export interface RealtimeTicketPayload {
  sub: string;
  type: JwtTokenType;
}

@Injectable()
export class RealtimeTicketService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Issues a ticket for the socket handshake.
   *
   * The lifetime is parsed here and the **number** is handed to the signer,
   * rather than passing the configured string through. Two reasons, and the
   * second is the one that matters: the client is told how long it has, and
   * that number must be the one the token was actually given. Passing the
   * string down and parsing it separately for the response is two readings of
   * the same value that can disagree — a client told "60 seconds" about a token
   * that expires in five would refresh far too late and lose the socket.
   */
  issue(userId: string): { ticket: string; expiresInSeconds: number } {
    const configured = this.configService.getOrThrow<string>(
      "auth.realtimeTicketExpiresIn",
    );
    const expiresInSeconds = readSeconds(configured);

    const ticket = this.jwtService.sign(
      {
        sub: userId,
        type: TOKEN_TYPE.REALTIME,
      } satisfies RealtimeTicketPayload,
      { expiresIn: expiresInSeconds },
    );

    return { ticket, expiresInSeconds };
  }

  /**
   * Verifies a handshake ticket and returns the user it belongs to.
   *
   * Throws for anything that is not a live `REALTIME` ticket — an access token
   * is rejected here even though it is perfectly valid elsewhere, because
   * accepting it would make this the one place the session could be replayed
   * from JavaScript.
   */
  async verify(ticket: string): Promise<string> {
    let payload: RealtimeTicketPayload;

    try {
      payload =
        await this.jwtService.verifyAsync<RealtimeTicketPayload>(ticket);
    } catch {
      // Deliberately opaque: whether it was malformed, expired, or signed with
      // another key is not information a caller should be able to probe for.
      throw new UnauthorizedException("Invalid or expired ticket.");
    }

    if (payload.type !== TOKEN_TYPE.REALTIME || !payload.sub) {
      throw new UnauthorizedException("Invalid or expired ticket.");
    }

    return payload.sub;
  }
}

/** Turns "1m" / "45s" / "900" into seconds, for a client that wants to refresh
 *  a little before the ticket dies. Falls back to a minute. */
function readSeconds(expiresIn: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(expiresIn.trim());
  if (!match) return 60;

  const value = Number(match[1]);
  const unit = match[2] ?? "s";
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;

  return value * multiplier;
}
