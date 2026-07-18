import { PrismaService } from "@/common";
import { Injectable, Logger } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";

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

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create an audit log entry
   */
  async log(data: AuditLogData, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      const prisma = tx || this.prisma;
      await prisma.auditLog.create({
        data: {
          userId: data.userId,
          performedById: data.performedById,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          oldValues: data.oldValues as any,
          newValues: data.newValues as any,
          changes: data.changes as any,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          requestId: data.requestId,
          metadata: data.metadata as any,
        },
      });
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
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      OR: [{ userId }, { performedById: userId }],
      deletedAt: null,
    };

    if (options?.action) {
      where.action = options.action;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
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
