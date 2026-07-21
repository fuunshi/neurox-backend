import { defineEntity, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { DB_TOKEN_TYPE } from "@/common/constant/enums/token-type.enum";
import { User } from "./user.entity";

const TokenSchema = defineEntity({
  name: "Token",
  tableName: "token",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).joinColumn("user_id").inversedBy("tokens"),
    token: p.string().length(500).unique(),
    tokenHash: p.string().fieldName("token_hash").unique(),
    type: p.enum(() => DB_TOKEN_TYPE).nativeEnumName("token_type"),
    expiresAt: p.datetime().fieldName("expires_at"),
    revokedAt: p.datetime().fieldName("revoked_at").nullable(),
    revokedReason: p.string().fieldName("revoked_reason").nullable(),
    deviceInfo: p.text().fieldName("device_info").nullable(),
    ipAddress: p.string().fieldName("ip_address").nullable(),
    userAgent: p.string().fieldName("user_agent").nullable(),
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
  indexes: [
    { properties: ["user"] },
    { properties: ["tokenHash"] },
    { properties: ["type"] },
    { properties: ["expiresAt"] },
    { properties: ["revokedAt"] },
    { properties: ["deletedAt"] },
  ],
});

export class Token extends TokenSchema.class {}
TokenSchema.setClass(Token);
