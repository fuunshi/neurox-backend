import { defineEntity, OptionalProps, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { User } from "./user.entity";

const RequestLogSchema = defineEntity({
  name: "RequestLog",
  tableName: "request_log",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    requestId: p.string().fieldName("request_id").unique(),
    user: () =>
      p
        .manyToOne(User)
        .joinColumn("user_id")
        .inversedBy("requestLogs")
        .nullable()
        .deleteRule("set null"),
    method: p.string(),
    path: p.string(),
    query: p.json().nullable(),
    body: p.json().nullable(),
    headers: p.json().nullable(),
    statusCode: p.integer().fieldName("status_code").nullable(),
    responseTime: p.integer().fieldName("response_time").nullable(),
    ipAddress: p.string().fieldName("ip_address").nullable(),
    userAgent: p.string().fieldName("user_agent").nullable(),
    errorMessage: p.text().fieldName("error_message").nullable(),
    errorStack: p.text().fieldName("error_stack").nullable(),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["requestId"] },
    { properties: ["user"] },
    { properties: ["method"] },
    { properties: ["path"] },
    { properties: ["statusCode"] },
    { properties: ["createdAt"] },
    { properties: ["deletedAt"] },
  ],
});

export class RequestLog extends RequestLogSchema.class {
  [OptionalProps]?: "query" | "body" | "headers";
}
RequestLogSchema.setClass(RequestLog);
