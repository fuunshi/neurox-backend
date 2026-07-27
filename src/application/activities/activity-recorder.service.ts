import {
  ActivityType,
  ContextType,
  EntityType,
} from "@/common/constant/activity";
import { Activity, User } from "@/database/entities";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable, Logger } from "@nestjs/common";

export interface RecordActivityInput {
  type: ActivityType;
  entityType: EntityType;
  entityId: string;
  /** The user who performed the action. */
  actorId: string;
  contextType?: ContextType;
  contextId?: string;
  parentEntityType?: EntityType;
  parentEntityId?: string;
  /** UI-friendly payload, e.g. `{ from: "open", to: "closed" }`. */
  data?: Record<string, unknown>;
}

/**
 * Writes history entries to the shared `activity` table.
 *
 * The read side already existed (`ActivitiesService.getActivities`); this is
 * the write side, so domain services can record what happened without each of
 * them reaching into the Activity entity directly.
 *
 * Recording is best-effort by design: a failure to write history must never
 * fail the operation that produced it.
 */
@Injectable()
export class ActivityRecorderService {
  private readonly logger = new Logger(ActivityRecorderService.name);

  constructor(private readonly em: EntityManager) {}

  /**
   * @param tx pass the transactional EntityManager when recording inside
   * `em.transactional()`, so the entry commits or rolls back with the change
   * it describes.
   */
  async record(input: RecordActivityInput, tx?: EntityManager): Promise<void> {
    const em = tx ?? this.em;

    try {
      em.create(Activity, {
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: em.getReference(User, input.actorId),
        parentEntityType: input.parentEntityType ?? null,
        parentEntityId: input.parentEntityId ?? null,
        contextType: input.contextType ?? null,
        contextId: input.contextId ?? null,
        data: input.data ?? {},
      });

      if (!tx) {
        await em.flush();
      }
    } catch (error) {
      this.logger.error(
        `Failed to record activity ${input.type} for ${input.entityType}:${input.entityId} :: ${String(error)}`,
      );
    }
  }
}
