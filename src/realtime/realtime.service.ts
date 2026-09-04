import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";
import {
  REALTIME_TOPICS,
  userRoom,
  type TopicRegistry,
} from "./realtime.topics";
import { SERVER_EVENTS } from "./realtime.types";

/**
 * The one way anything in the application reaches an open socket.
 *
 * Producers depend on this, never on the gateway — so a domain module can emit
 * without importing the websocket layer, and `main.ts` is the only place that
 * decides whether a socket server exists at all.
 *
 * ## Everything here is best-effort
 *
 * The server is null until the gateway initializes, and a process with no
 * gateway (the worker) never has one. Every method therefore no-ops rather than
 * throwing: a notification that could not be pushed is still a row that will be
 * fetched on the next page load, and it must never be the reason a password
 * change fails. Delivery is a nicety; the write is the truth.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  constructor(
    @Inject(REALTIME_TOPICS) private readonly topics: TopicRegistry,
  ) {}

  /** Called by the gateway once Socket.IO is listening. The registry arrives by
   *  injection instead, so it is populated before anything can read it. */
  attach(server: Server): void {
    this.server = server;
  }

  get isLive(): boolean {
    return this.server !== null;
  }

  resolvableTopics(): TopicRegistry {
    return this.topics;
  }

  /** Sends to every socket belonging to one reader, on any device. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitToRoom(userRoom(userId), event, payload);
  }

  /** Sends to everyone watching a topic — see `realtime.topics.ts`. */
  emitToRoom(room: string, event: string, payload: unknown): void {
    if (!this.server) return;

    try {
      this.server.to(room).emit(event, payload);
    } catch (error) {
      this.logger.warn(
        `Could not emit "${event}" to ${room}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Tells a reader their unread count moved without sending the notification.
   *
   * Used when one tab marks things read: the other tabs are not being handed a
   * new notification, they are being told a number they are showing is stale.
   */
  emitUnreadCount(userId: string, unreadCount: number): void {
    this.emitToUser(userId, SERVER_EVENTS.UNREAD_CHANGED, { unreadCount });
  }
}
