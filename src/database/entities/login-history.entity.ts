import { defineEntity, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { User } from "./user.entity";

const LoginHistorySchema = defineEntity({
  name: "LoginHistory",
  tableName: "login_history",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () =>
      p.manyToOne(User).joinColumn("user_id").inversedBy("loginHistory"),
    loginAt: p
      .datetime()
      .fieldName("login_at")
      .onCreate(() => new Date()),
    logoutAt: p.datetime().fieldName("logout_at").nullable(),
    ipAddress: p.string().fieldName("ip_address").nullable(),
    userAgent: p.string().fieldName("user_agent").nullable(),
    deviceType: p.string().fieldName("device_type").nullable(),
    browser: p.string().nullable(),
    os: p.string().nullable(),
    location: p.string().nullable(),
    latitude: p.float().nullable(),
    longitude: p.float().nullable(),
    isSuccessful: p.boolean().fieldName("is_successful").default(true),
    failureReason: p.string().fieldName("failure_reason").nullable(),
    sessionDuration: p.integer().fieldName("session_duration").nullable(),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .fieldName("updated_at")
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
  filters: softDeleteFilters,
  indexes: [{ properties: ["user", "loginAt"] }, { properties: ["deletedAt"] }],
});

export class LoginHistory extends LoginHistorySchema.class {}
LoginHistorySchema.setClass(LoginHistory);
