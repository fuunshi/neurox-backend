import {
  SETTING_DEFAULTS,
  SettingKey,
} from "@/common/constant/settings.constant";
import { AppSetting } from "@/database/entities";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";

/**
 * Reads admin-editable settings from the `app_setting` table.
 *
 * Every getter falls back to `SETTING_DEFAULTS` when the row is absent, so a
 * fresh database behaves correctly without requiring a seed.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly em: EntityManager) {}

  async get(key: SettingKey): Promise<string> {
    const row = await this.em.findOne(AppSetting, { key });
    return row?.value ?? SETTING_DEFAULTS[key];
  }

  async getNumber(key: SettingKey): Promise<number> {
    const raw = await this.get(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Number(SETTING_DEFAULTS[key]);
  }

  async set(key: SettingKey, value: string): Promise<void> {
    const row = await this.em.findOne(AppSetting, { key });

    if (row) {
      this.em.assign(row, { value });
    } else {
      this.em.create(AppSetting, { key, value });
    }

    await this.em.flush();
  }
}
