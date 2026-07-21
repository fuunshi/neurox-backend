import { defineEntity, OptionalProps, p } from "@mikro-orm/core";
import { softDeleteFilters } from "../filters/soft-delete.filter";
import { User } from "./user.entity";

const UserProfileSchema = defineEntity({
  name: "UserProfile",
  tableName: "user_profile",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () =>
      p.oneToOne(User).joinColumn("user_id").inversedBy("profile").unique(),
    firstName: p.string().fieldName("first_name"),
    lastName: p.string().fieldName("last_name").nullable(),
    displayName: p.string().fieldName("display_name").nullable(),
    avatar: p.string().nullable(),
    bio: p.text().nullable(),
    phoneNumber: p.string().fieldName("phone_number").nullable().unique(),
    dateOfBirth: p.datetime().fieldName("date_of_birth").nullable(),
    gender: p.string().nullable(),
    country: p.string().nullable(),
    state: p.string().nullable(),
    city: p.string().nullable(),
    address: p.text().nullable(),
    postalCode: p.string().fieldName("postal_code").nullable(),
    timezone: p.string().nullable().default("UTC"),
    language: p.string().nullable().default("en"),
    currency: p.string().nullable().default("USD"),
    website: p.string().nullable(),
    socialLinks: p.json().fieldName("social_links").nullable(),
    preferences: p.json().nullable(),
    metadata: p.json().nullable(),
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
    { properties: ["phoneNumber"] },
    { properties: ["deletedAt"] },
  ],
});

export class UserProfile extends UserProfileSchema.class {
  // MikroORM v7 requires JSON columns in create data unless declared optional,
  // even when nullable.
  [OptionalProps]?: "socialLinks" | "preferences" | "metadata";
}
UserProfileSchema.setClass(UserProfile);
