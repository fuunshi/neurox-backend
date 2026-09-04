import { CONTEXT_TYPES, ContextType } from "@/common/constant";
import { RequestUserType } from "@/common/types/request.type";
import { Activity } from "@/database/entities";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { ActivitiesListDTO } from "./dto/activities-list.dto";

@Injectable()
export class ActivitiesService {
  constructor(private readonly em: EntityManager) {}

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
      this.verifyContextAccess(user, dto.contextType, dto.contextId);
    }

    const where: FilterQuery<Activity> = {};

    if (dto.entityType && dto.entityId) {
      where.entityType = dto.entityType;
      where.entityId = dto.entityId;
    }

    if (dto.contextType && dto.contextId) {
      where.contextType = dto.contextType;
      where.contextId = dto.contextId;
    }

    if (dto.actorId?.length) {
      where.actor = {
        $in: dto.actorId,
      };
    }

    if (dto.since || dto.until) {
      where.createdAt = {
        ...(dto.since ? { $gte: new Date(dto.since) } : {}),
        ...(dto.until ? { $lte: new Date(dto.until) } : {}),
      };
    }

    // The cursor is opaque to the client: it only ever carries the `{ id }`
    // this method emits as `nextCursor`, so it is read back as that.
    const cursor = dto.cursor
      ? (JSON.parse(Buffer.from(dto.cursor, "base64").toString()) as {
          id: string;
        })
      : null;

    // `em.find` has no positional cursor, so the equivalent of Prisma's
    // `cursor: { id }` + `skip: 1` is a keyset resume: the cursor row's
    // ordering key is resolved and the query continues strictly after it in
    // `[createdAt desc, id desc]` order. A cursor whose row no longer exists
    // matches nothing, exactly as the positional cursor did.
    if (cursor) {
      const cursorActivity = await this.em.findOne(
        Activity,
        { id: cursor.id },
        { fields: ["createdAt"] },
      );

      where.$or = cursorActivity
        ? [
            { createdAt: { $lt: cursorActivity.createdAt } },
            {
              createdAt: cursorActivity.createdAt,
              id: { $lt: cursor.id },
            },
          ]
        : [{ id: { $in: [] } }];
    }

    const activities = await this.em.find(Activity, where, {
      fields: [
        "id",
        "type",
        "entityType",
        "entityId",
        "contextType",
        "contextId",
        "createdAt",
        "data",
        "actor.id",
        "actor.username",
        "actor.profile.firstName",
        "actor.profile.lastName",
      ],

      populate: ["actor", "actor.profile"],

      orderBy: [{ createdAt: "desc" }, { id: "desc" }],

      limit: dto.limit + 1,
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

  verifyContextAccess(
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
