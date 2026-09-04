import type { NotificationDTO } from "@/application/notification/dto/notification.dto";
import type { JobProgressPayload } from "./realtime.payloads";

/**
 * The socket's vocabulary, in one place.
 *
 * A single namespace carries everything, and events are named by what they
 * carry rather than by who sent them, so adding a stream is an entry here plus
 * a room to send it to — not another connection with its own handshake and its
 * own bugs.
 */

/** Server → client. */
export const SERVER_EVENTS = {
  /** A newly created notification, already rendered. */
  NOTIFICATION: "notification",
  /** The unread count changed without a new notification — currently only
   *  because the reader marked things read in another tab. */
  UNREAD_CHANGED: "unread-changed",
  /** Progress on a deck generation job. */
  JOB_UPDATED: "job:updated",
  /** Confirms a subscription, so the client knows the room was actually
   *  joined rather than silently refused. */
  SUBSCRIBED: "subscribed",
  UNSUBSCRIBED: "unsubscribed",
  /** A refused or failed subscription. Sent to the one client, not the room. */
  ERROR: "realtime:error",
} as const;

/** Client → server. */
export const CLIENT_EVENTS = {
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
} as const;

export interface NotificationMessage {
  notification: NotificationDTO;
  unreadCount: number;
}

export type JobUpdatedMessage = JobProgressPayload;

export interface SubscriptionAck {
  topic: string;
}

export interface RealtimeErrorMessage {
  topic?: string;
  message: string;
}
