import { Injectable, Logger } from "@nestjs/common";
import { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { AuditAction } from "@/common/constant/enums";
import { AuditLog, User } from "@/database/entities";

export interface AuditLogData {
  userId?: string;
  performedById?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly em: EntityManager) {}

  /**
   * Create an audit log entry.
   *
   * Pass `tx` when calling inside `em.transactional()`: the row is then created
   * on that transactional EntityManager and persisted by the caller's commit,
   * rather than being flushed independently.
   */
  async log(data: AuditLogData, tx?: EntityManager): Promise<void> {
    try {
      const em = tx ?? this.em;
      em.create(AuditLog, {
        user: data.userId ? em.getReference(User, data.userId) : null,
        performedBy: data.performedById
          ? em.getReference(User, data.performedById)
          : null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        oldValues: data.oldValues ?? null,
        newValues: data.newValues ?? null,
        changes: data.changes ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        requestId: data.requestId ?? null,
        metadata: data.metadata ?? null,
      });

      if (!tx) {
        await em.flush();
      }
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error}`);
    }
  }

  /**
   * Log a user action
   */
  async logUserAction(
    action: AuditAction,
    userId: string,
    performedById: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
    metadata?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const changes = this.calculateChanges(oldValues, newValues);
    await this.log({
      userId,
      performedById,
      action,
      entityType: "User",
      entityId: userId,
      oldValues,
      newValues,
      changes,
      ...metadata,
    });
  }

  /**
   * Log a token action
   */
  async logTokenAction(
    action: AuditAction,
    tokenId: string,
    userId: string,
    performedById: string,
    metadata?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    await this.log({
      userId,
      performedById,
      action,
      entityType: "Token",
      entityId: tokenId,
      ...metadata,
    });
  }

  /**
   * Get audit logs for a user
   */
  async getLogsForUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      action?: AuditAction;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    // `deletedAt: null` is kept explicit rather than relying solely on the
    // global soft-delete filter, so this behaves identically either way.
    const where: FilterQuery<AuditLog> = {
      $or: [{ user: userId }, { performedBy: userId }],
      deletedAt: null,
    };

    if (options?.action) {
      where.action = options.action;
    }

    const [logs, total] = await Promise.all([
      this.em.find(AuditLog, where, {
        orderBy: { createdAt: "desc" },
        offset,
        limit,
      }),
      this.em.count(AuditLog, where),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Calculate changes between old and new values
   */
  private calculateChanges(
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
  ): Record<string, { old: unknown; new: unknown }> | undefined {
    if (!oldValues || !newValues) return undefined;

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const allKeys = new Set([
      ...Object.keys(oldValues),
      ...Object.keys(newValues),
    ]);

    for (const key of allKeys) {
      if (oldValues[key] !== newValues[key]) {
        changes[key] = {
          old: oldValues[key],
          new: newValues[key],
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : undefined;
  }
}
