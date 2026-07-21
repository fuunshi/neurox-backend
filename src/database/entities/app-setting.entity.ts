import { defineEntity, p } from "@mikro-orm/core";

/**
 * Runtime-editable application settings, managed at the database level so an
 * admin can change behaviour without a redeploy.
 *
 * Values are stored as strings; `SettingsService` coerces them and falls back
 * to the defaults declared in `@/common/constant` when a row is absent.
 */
const AppSettingSchema = defineEntity({
  name: "AppSetting",
  tableName: "app_setting",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    key: p.string().unique(),
    value: p.string(),
    description: p.string().nullable(),
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
  indexes: [{ properties: ["key"] }],
});

export class AppSetting extends AppSettingSchema.class {}
AppSettingSchema.setClass(AppSetting);
