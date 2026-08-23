import { Migration } from "@mikro-orm/migrations";

export class Migration20260924093230 extends Migration {
  override name = "Migration20260924093230";

  override up(): void | Promise<void> {
    this.addSql(`alter table "card_review" add "previous_state" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "card_review" drop column "previous_state";`);
  }
}
