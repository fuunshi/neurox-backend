import { defineEntity, OptionalProps, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { AUDIT_ACTION } from "@/common/constant/enums/audit-action.enum";
import { User } from "./user.entity";

const AuditLogSchema = defineEntity({
  name: "AuditLog",
  tableName: "audit_log",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () =>
      p
        .manyToOne(User)
        .joinColumn("user_id")
        .inversedBy("auditLogs")
        .nullable()
        .deleteRule("set null"),
    performedBy: () =>
      p
        .manyToOne(User)
        .joinColumn("performed_by_id")
        .inversedBy("performedAuditLogs")
        .nullable()
        .deleteRule("set null"),
    action: p.enum(() => AUDIT_ACTION).nativeEnumName("audit_action"),
    entityType: p.string().fieldName("entity_type"),
    entityId: p.string().fieldName("entity_id").nullable(),
    oldValues: p.json().fieldName("old_values").nullable(),
    newValues: p.json().fieldName("new_values").nullable(),
    changes: p.json().nullable(),
    ipAddress: p.string().fieldName("ip_address").nullable(),
    userAgent: p.string().fieldName("user_agent").nullable(),
    requestId: p.string().fieldName("request_id").nullable(),
    metadata: p.json().nullable(),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["user"] },
    { properties: ["performedBy"] },
    { properties: ["action"] },
    { properties: ["entityType"] },
    { properties: ["entityId"] },
    { properties: ["createdAt"] },
    { properties: ["deletedAt"] },
  ],
});

export class AuditLog extends AuditLogSchema.class {
  [OptionalProps]?: "oldValues" | "newValues" | "changes" | "metadata";
}
AuditLogSchema.setClass(AuditLog);
