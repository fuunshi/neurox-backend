import { ConfigService } from "@nestjs/config";
import { Logger, UseFilters } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type WsResponse,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { RealtimeService } from "./realtime.service";
import { RealtimeTicketService } from "./realtime.ticket";
import { RealtimeExceptionFilter } from "./realtime-exception.filter";
import { resolveTopic, topicRoom, userRoom } from "./realtime.topics";
import { CLIENT_EVENTS, SERVER_EVENTS } from "./realtime.types";

/** What the gateway stashes on a socket between messages. */
interface SocketData {
  userId: string;
}

/**
 * The socket endpoint.
 *
 * ## Authentication
 *
 * Every connection must present a `REALTIME` ticket in the handshake — see
 * `realtime.ticket.ts` for why a ticket rather than the session, and what stops
 * it being a session token in disguise. A socket that cannot prove who it is
 * gets `connect_error` immediately, so an unauthenticated client holds no
 * connection at all rather than a silent, unusable one.
 *
 * ## Rooms
 *
 * On connect a socket joins exactly one room: its owner's. That is where
 * notifications go, and it is the reason a new browser tab does not have to ask
 * for anything — the same reader is already in the same room.
 *
 * Everything else is opt-in and authorized. See `subscribe` below.
 *
 * ## Failures
 *
 * A socket error is answered by `RealtimeExceptionFilter`, which has to be
 * declared here: global filters are not applied to WebSocket messages. See that
 * file for why.
 */
@UseFilters(RealtimeExceptionFilter)
@WebSocketGateway({
  namespace: "/realtime",
  cors: { origin: socketOrigins(), credentials: false },
  // Long enough that a reader who switches tabs and comes back reuses the same
  // connection instead of paying for a new handshake and a new ticket.
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly tickets: RealtimeTicketService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.logger.log("Realtime gateway listening on /realtime.");
  }

  async handleConnection(socket: Socket): Promise<void> {
    const ticket = readHandshakeTicket(socket);

    if (!ticket) {
      socket.disconnect(true);
      return;
    }

    try {
      const userId = await this.tickets.verify(ticket);

      (socket.data as SocketData).userId = userId;
      await socket.join(userRoom(userId));
    } catch {
      // No detail in the client's hands: whether the ticket was malformed,
      // expired or issued for someone else is not something to probe for. The
      // server log keeps the fact that it happened.
      this.logger.debug(
        "Rejected a realtime connection with an invalid ticket.",
      );
      socket.disconnect(true);
    }
  }

  /**
   * Joins a topic's room, if this reader is allowed in.
   *
   * The refusal is deliberate and answers to the one client rather than
   * disconnecting: a reader whose subscription was refused should lose the
   * stream, not the connection and the notifications that came with it.
   */
  @SubscribeMessage(CLIENT_EVENTS.SUBSCRIBE)
  async onSubscribe(
    socket: Socket,
    payload: unknown,
  ): Promise<WsResponse<unknown>> {
    const userId = (socket.data as SocketData).userId;

    if (!userId) {
      return {
        event: SERVER_EVENTS.ERROR,
        data: { message: "Not authenticated." },
      };
    }

    const topic = readTopic(payload);
    const resolved = resolveTopic(this.realtime.resolvableTopics(), topic);

    if (!resolved) {
      return {
        event: SERVER_EVENTS.ERROR,
        data: { topic, message: "Unknown topic." },
      };
    }

    const allowed = await this.isAllowed(userId, resolved.name, resolved.id);

    if (!allowed) {
      return {
        event: SERVER_EVENTS.ERROR,
        data: { topic, message: "Not allowed to subscribe to that." },
      };
    }

    const room = topicRoom(resolved.name, resolved.id);
    await socket.join(room);
    this.logger.debug(`${userId} subscribed to ${room}.`);

    return { event: SERVER_EVENTS.SUBSCRIBED, data: { topic } };
  }

  @SubscribeMessage(CLIENT_EVENTS.UNSUBSCRIBE)
  async onUnsubscribe(
    socket: Socket,
    payload: unknown,
  ): Promise<WsResponse<unknown>> {
    const topic = readTopic(payload);
    const resolved = resolveTopic(this.realtime.resolvableTopics(), topic);

    // No authorization check on the way out: leaving a room you are in is not a
    // disclosure, and refusing it would only strand the client.
    if (resolved) await socket.leave(topicRoom(resolved.name, resolved.id));

    return { event: SERVER_EVENTS.UNSUBSCRIBED, data: { topic } };
  }

  /** The allowlist check, behind one try/catch so a database blip refuses the
   *  subscription rather than taking the socket down with it. */
  private async isAllowed(
    userId: string,
    name: string,
    id: string,
  ): Promise<boolean> {
    const definition = this.realtime.resolvableTopics()[name];
    if (!definition) return false;

    try {
      return await definition.canSubscribe(userId, id);
    } catch (error) {
      this.logger.warn(
        `Topic check failed for ${name}:${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

/**
 * The topic name a client sent.
 *
 * Read as a string or not at all, rather than stringified: `String(object)`
 * produces `"[object Object]"`, which would be handed to the topic resolver as
 * if the client had asked for a topic by that name. Nothing useful comes of
 * that, and it hides a client sending the wrong shape.
 */
function readTopic(payload: unknown): string {
  const raw = (payload as { topic?: unknown } | null)?.topic;
  return typeof raw === "string" ? raw : "";
}

/**
 * The same allowlist the HTTP API uses, where it can be read.
 *
 * Read from `process.env` at import time because the decorator is evaluated
 * then and Socket.IO takes its CORS options at construction — there is no later
 * hook to set them. In a container the variables are part of the environment
 * before Node starts, so this sees them; locally they usually live in `.env`,
 * which `ConfigModule` loads later, so a development stack falls back to
 * reflecting the caller's origin.
 *
 * That fallback is not the security boundary and is not treated as one: CORS is
 * a browser rule that any non-browser client ignores, so what actually keeps a
 * socket private is the ticket every connection must present. This narrows the
 * browser surface; the ticket is what closes it.
 */
function socketOrigins(): string[] | boolean {
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : true;
}

/**
 * The ticket from wherever the client put it.
 *
 * `auth` first, which is the documented place; the header is accepted so a
 * non-browser client (a script, a test) can connect without reproducing
 * Socket.IO's auth handshake.
 */
function readHandshakeTicket(socket: Socket): string | null {
  const fromAuth = (socket.handshake.auth as { ticket?: unknown } | undefined)
    ?.ticket;
  if (typeof fromAuth === "string" && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return null;
}
