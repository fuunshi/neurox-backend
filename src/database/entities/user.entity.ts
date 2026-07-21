import { defineEntity, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { ACCOUNT_STATUS } from "@/common/constant/enums/account-status.enum";
import { ROLE } from "@/common/constant/enums/role.enum";
import { Activity } from "./activity.entity";
import { AuditLog } from "./audit-log.entity";
import { LoginHistory } from "./login-history.entity";
import { RequestLog } from "./request-log.entity";
import { Token } from "./token.entity";
import { UserProfile } from "./user-profile.entity";

const UserSchema = defineEntity({
  name: "User",
  tableName: "user",
  properties: {
    // Note: the primary key column is `user_id`, not `id` (unlike every other model).
    id: p.uuid().primary().fieldName("user_id").defaultRaw("gen_random_uuid()"),
    email: p.string().unique(),
    username: p.string().unique(),
    password: p.string(),
    role: p
      .enum(() => ROLE)
      .nativeEnumName("role")
      .default(ROLE.USER),
    status: p
      .enum(() => ACCOUNT_STATUS)
      .nativeEnumName("account_status")
      .default(ACCOUNT_STATUS.PENDING_VERIFICATION),
    isActive: p.boolean().fieldName("is_active").default(true),
    emailVerified: p.boolean().fieldName("email_verified").default(false),
    emailVerifiedAt: p.datetime().fieldName("email_verified_at").nullable(),
    phoneVerified: p.boolean().fieldName("phone_verified").default(false),
    phoneVerifiedAt: p.datetime().fieldName("phone_verified_at").nullable(),
    twoFactorEnforced: p
      .boolean()
      .fieldName("two_factor_enforced")
      .default(false),
    twoFactorEnabled: p
      .boolean()
      .fieldName("two_factor_enabled")
      .default(false),
    twoFactorSecret: p.string().fieldName("two_factor_secret").nullable(),
    passwordChangedAt: p.datetime().fieldName("password_changed_at").nullable(),
    lastLoginAt: p.datetime().fieldName("last_login_at").nullable(),
    lastLoginIp: p.string().fieldName("last_login_ip").nullable(),
    forcePasswordChange: p
      .boolean()
      .fieldName("force_password_change")
      .default(false),
    failedLoginAttempts: p
      .integer()
      .fieldName("failed_login_attempts")
      .default(0),
    lockedUntil: p.datetime().fieldName("locked_until").nullable(),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    /**
     * Set when the recycle job rewrites `email` to `<unixMillis>-<original>`.
     * Distinguishes an already-released address from one still inside the
     * recovery window -- the email string itself cannot be pattern-matched
     * reliably. Null means "never recycled".
     */
    emailRecycledAt: p.datetime().fieldName("email_recycled_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .fieldName("updated_at")
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),

    profile: () => p.oneToOne(UserProfile).mappedBy("user").nullable(),
    tokens: () => p.oneToMany(Token).mappedBy("user"),
    loginHistory: () => p.oneToMany(LoginHistory).mappedBy("user"),
    auditLogs: () => p.oneToMany(AuditLog).mappedBy("user"),
    performedAuditLogs: () => p.oneToMany(AuditLog).mappedBy("performedBy"),
    requestLogs: () => p.oneToMany(RequestLog).mappedBy("user"),
    activities: () => p.oneToMany(Activity).mappedBy("actor"),
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["email"] },
    { properties: ["status"] },
    { properties: ["deletedAt"] },
    { properties: ["emailRecycledAt"] },
    // Drives the recycle job's lookup: soft-deleted and not yet released.
    { properties: ["deletedAt", "emailRecycledAt"] },
  ],
});

export class User extends UserSchema.class {}
UserSchema.setClass(User);
