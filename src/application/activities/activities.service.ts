import { PrismaService } from "@/common";
import { CONTEXT_TYPES, ContextType } from "@/common/constant";
import { RequestUserType } from "@/common/types/request.type";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ActivitiesListDTO } from "./dto/activities-list.dto";

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async getActivities(user: RequestUserType, dto: ActivitiesListDTO) {
    if (
      (dto.entityId && !dto.entityType) ||
      (!dto.entityId && dto.entityType)
    ) {
      throw new BadRequestException(
        "entityType and entityId must be provided together",
      );
    }

    if (dto.contextType && dto.contextId) {
      await this.verifyContextAccess(user, dto.contextType, dto.contextId);
    }

    const where: Prisma.ActivityWhereInput = {};

    if (dto.entityType && dto.entityId) {
      where.entityType = dto.entityType;
      where.entityId = dto.entityId;
    }

    if (dto.contextType && dto.contextId) {
      where.contextType = dto.contextType;
      where.contextId = dto.contextId;
    }

    if (dto.actorId?.length) {
      where.actorId = {
        in: dto.actorId,
      };
    }

    if (dto.since || dto.until) {
      where.createdAt = {};

      if (dto.since) {
        where.createdAt.gte = new Date(dto.since);
      }

      if (dto.until) {
        where.createdAt.lte = new Date(dto.until);
      }
    }

    const cursor = dto.cursor
      ? JSON.parse(Buffer.from(dto.cursor, "base64").toString())
      : null;

    const activities = await this.prisma.activity.findMany({
      where,

      take: dto.limit + 1,

      skip: cursor ? 1 : 0,

      cursor: cursor
        ? {
          id: cursor.id,
        }
        : undefined,

      orderBy: [{ createdAt: "desc" }, { id: "desc" }],

      select: {
        id: true,
        type: true,
        entityType: true,
        entityId: true,
        contextType: true,
        contextId: true,
        createdAt: true,
        data: true,
        actor: {
          select: {
            id: true,
            username: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const hasMore = activities.length > dto.limit;

    if (hasMore) {
      activities.pop();
    }

    const last = activities[activities.length - 1];

    const nextCursor = last
      ? Buffer.from(
        JSON.stringify({
          id: last.id,
        }),
      ).toString("base64")
      : null;

    return {
      data: activities,
      pagination: {
        nextCursor,
        hasMore,
        limit: dto.limit,
      },
    };
  }

  async verifyContextAccess(
    user: RequestUserType,
    contextType: ContextType,
    contextId: string,
  ) {
    switch (contextType) {
      case CONTEXT_TYPES.USER:
        if (user.id !== contextId) {
          throw new ForbiddenException(
            "You do not have access to this context",
          );
        }
        return;

      default:
        throw new ForbiddenException("Invalid context type");
    }
  }

}
