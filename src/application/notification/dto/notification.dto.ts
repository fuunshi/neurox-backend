import { CursorPaginationQueryDTO } from "@/common/dto";
import type { NotificationTone } from "@/application/notification/notification.templates";
import { ApiProperty } from "@nestjs/swagger";

/**
 * A notification as the client sees it: the template, already rendered.
 *
 * The `type` travels alongside the wording so the client can group, filter or
 * icon it without parsing a sentence — and so a client that disagrees with the
 * server's phrasing can say so itself.
 */
export class NotificationDTO {
  @ApiProperty() id!: string;

  @ApiProperty({
    description:
      "The template key. The wording is rendered from it server-side; the row " +
      "stores this and its parameters, never the text.",
  })
  type!: string;

  @ApiProperty() title!: string;
  @ApiProperty() body!: string;

  @ApiProperty({
    nullable: true,
    description: "Where clicking it should go, or null when there is nowhere.",
  })
  href!: string | null;

  @ApiProperty({
    enum: ["neutral", "accent", "due", "success", "danger"],
    description: "Which of the product's existing tones to render it in.",
  })
  tone!: NotificationTone;

  @ApiProperty({ nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class NotificationListResponseDTO {
  @ApiProperty({ type: [NotificationDTO] }) data!: NotificationDTO[];

  @ApiProperty({
    description: "How many are unread, for the badge.",
  })
  unreadCount!: number;

  @ApiProperty({
    description:
      "Whether another page exists. The list is a feed, so the cursor is " +
      "accepted on the next request rather than echoed here.",
  })
  hasMore!: boolean;
}

export class NotificationListQueryDTO extends CursorPaginationQueryDTO {}

/** Streaming a socket is not a REST route, but the socket needs to know where
 *  to send a client that decides to fetch the rest of the list. */
export const NOTIFICATION_LIMITS = {
  /** Enough to fill the panel without a scroll, and one screen of history. */
  PAGE_SIZE: 20,
} as const;
