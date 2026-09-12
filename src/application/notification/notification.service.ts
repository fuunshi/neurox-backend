import { RealtimeService } from "@/realtime/realtime.service";
import {
  SERVER_EVENTS,
  type NotificationMessage,
} from "@/realtime/realtime.types";
import { Notification, User } from "@/database/entities";
import { EntityManager, type FilterQuery } from "@mikro-orm/postgresql";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  buildPage,
  decodeCursor,
  keysetAfter,
} from "@/common/utils/pagination/cursor.util";
import {
  NOTIFICATION_LIMITS,
  type NotificationDTO,
} from "./dto/notification.dto";
import {
  renderNotification,
  type NotificationDraft,
} from "./notification.templates";
import { MetricsService } from "@/infra/metrics/metrics.service";

/**
 * Creating, reading and acknowledging notifications.
 *
 * ## The write is the truth; the push is a courtesy
 *
 * `create` persists first and pushes second, and it never throws. A producer
 * calls this from inside an operation that matters — accepting an import,
 * changing a password — and a notification is not worth failing that for. If
 * the row cannot be written, the log says so and the caller carries on; if the
 * push cannot be made, the row is still there on the next page load.
 *
 * ## Why the read renders
 *
 * Rows store a template key and its parameters. Everything a reader sees is
 * produced here, by `renderNotification`, which is why the list survives a
 * reworded template and why a row cannot carry text of its own into the UI.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly realtime: RealtimeService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Records a notification and pushes it to the reader's open sockets.
   *
   * Never rejects: see the class note.
   */
  async create(userId: string, draft: NotificationDraft): Promise<void> {
    try {
      const notification = this.em.create(Notification, {
        user: this.em.getReference(User, userId),
        type: draft.type,
        params: draft.params,
      });

      await this.em.flush();

      // Counted after the write, so the figure is rows that exist rather than
      // attempts to write one.
      this.metrics.countNotification(draft.type);

      const rendered = renderNotification(draft.type, draft.params);
      if (!rendered) return;

      const unreadCount = await this.unreadCount(userId);

      const message: NotificationMessage = {
        notification: {
          id: notification.id,
          type: draft.type,
          ...rendered,
          readAt: null,
          createdAt: notification.createdAt,
        },
        unreadCount,
      };

      this.realtime.emitToUser(userId, SERVER_EVENTS.NOTIFICATION, message);
    } catch (error) {
      // Deliberately swallowed. The caller is in the middle of something the
      // reader actually asked for, and failing it because a courtesy could not
      // be delivered would be the wrong trade every time.
      this.logger.error(
        `Could not record a ${draft.type} notification for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * The reader's notifications, newest first, rendered.
   *
   * A row whose template this build no longer knows is skipped rather than
   * shown as a blank — a rename should cost a notification, not the list.
   */
  async list(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    data: NotificationDTO[];
    unreadCount: number;
    hasMore: boolean;
  }> {
    const limit = options.limit ?? NOTIFICATION_LIMITS.PAGE_SIZE;

    const where: FilterQuery<Notification> = {
      user: userId,
      ...keysetAfter(decodeCursor(options.cursor)),
    };

    // One extra row, so "is there another page" is answered by the data rather
    // than by a second count that could disagree with it.
    const rows = await this.em.find(Notification, where, {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: limit + 1,
    });

    const page = buildPage(rows, limit);
    const unreadCount = await this.unreadCount(userId);

    return {
      data: page.data
        .map((row) => this.toDTO(row))
        .filter((dto): dto is NotificationDTO => dto !== null),
      unreadCount,
      hasMore: page.pagination.hasMore,
    };
  }

  /** The number behind the badge. Counted in the database rather than by
   *  loading rows, because it is asked on every page render. */
  async unreadCount(userId: string): Promise<number> {
    return this.em.count(Notification, { user: userId, readAt: null });
  }

  /**
   * Marks one notification read, and tells the reader's other tabs.
   *
   * Scoped by user rather than looked up by id and then checked: a wrong id
   * from another account is a 404 here, which is also what a nonexistent id is,
   * so this cannot be used to learn whether an id exists elsewhere.
   */
  async markRead(userId: string, notificationId: string): Promise<number> {
    const notification = await this.em.findOne(Notification, {
      id: notificationId,
      user: userId,
    });

    if (!notification) {
      throw new NotFoundException("No such notification.");
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.em.flush();
    }

    const unreadCount = await this.unreadCount(userId);
    this.realtime.emitUnreadCount(userId, unreadCount);

    return unreadCount;
  }

  /** Marks everything read. Returns the count that was unread, for the log and
   *  the response — after this it is zero either way. */
  async markAllRead(userId: string): Promise<number> {
    const cleared = await this.em.nativeUpdate(
      Notification,
      { user: userId, readAt: null },
      { readAt: new Date() },
    );

    this.realtime.emitUnreadCount(userId, 0);

    return cleared;
  }

  private toDTO(row: Notification): NotificationDTO | null {
    const rendered = renderNotification(row.type, row.params);
    if (!rendered) return null;

    return {
      id: row.id,
      type: row.type,
      ...rendered,
      readAt: row.readAt ?? null,
      createdAt: row.createdAt,
    };
  }
}
