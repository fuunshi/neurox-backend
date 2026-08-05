import { Migration } from "@mikro-orm/migrations";

export class Migration20260923101102 extends Migration {
  override name = "Migration20260923101102";

  override up(): void | Promise<void> {
    this.addSql(`alter table "source" alter column "mime_type" drop not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "source" alter column "mime_type" set not null;`);
  }
}
