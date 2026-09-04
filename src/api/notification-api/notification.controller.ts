import { NotificationService } from "@/application/notification/notification.service";
import {
  NotificationListQueryDTO,
  NotificationListResponseDTO,
} from "@/application/notification/dto/notification.dto";
import { AuthenticatedRequest } from "@/common/types/request.type";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";

/**
 * The REST half of notifications.
 *
 * The socket pushes new ones, but a list has to survive a page load: a reader
 * who was away, or who has three tabs, still needs the history and the badge.
 * Nor is the socket required for any of this — a connection that cannot be
 * established costs live delivery and nothing else, which is why the front end
 * can treat it as an enhancement rather than a dependency.
 */
@ApiBearerAuth()
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: "List your notifications, newest first",
    description:
      "Each entry is a template rendered server-side; the stored row holds the " +
      "template key and its parameters, not the wording.",
  })
  @ApiResponse({ status: 200, type: NotificationListResponseDTO })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() dto: NotificationListQueryDTO,
  ): Promise<NotificationListResponseDTO> {
    return this.notifications.list(req.authContext.user.id, {
      limit: dto.limit,
      cursor: dto.cursor,
    });
  }

  @Get("unread-count")
  @ApiOperation({
    summary: "How many are unread",
    description:
      "Counted in the database rather than by reading rows, because the badge " +
      "asks for it on every page.",
  })
  async unreadCount(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ unreadCount: number }> {
    return {
      unreadCount: await this.notifications.unreadCount(
        req.authContext.user.id,
      ),
    };
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark one notification read" })
  async markRead(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<{ unreadCount: number }> {
    return {
      unreadCount: await this.notifications.markRead(
        req.authContext.user.id,
        id,
      ),
    };
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark every notification read" })
  async markAllRead(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ cleared: number }> {
    return {
      cleared: await this.notifications.markAllRead(req.authContext.user.id),
    };
  }
}
