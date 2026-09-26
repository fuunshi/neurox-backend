import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CurriculumModule } from "./curriculum.module";
import { CurriculumService } from "./curriculum.service";

/**
 * Installs the TU BCA syllabus, from the command line.
 *
 *   pnpm run curriculum:seed
 *
 * Reference data, not demo data — run it in every environment, including
 * production, after `migrate:up`. It is idempotent: nodes are upserted by path
 * and existing notes are left untouched, so a second run reports zero changes
 * rather than failing or duplicating.
 */
async function bootstrap() {
  const logger = new Logger("Curriculum");

  const app = await NestFactory.createApplicationContext(CurriculumModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const report = await app.get(CurriculumService).seed();

    logger.log("Syllabus ready");
    logger.log(
      `  nodes     ${report.nodesCreated} created · ${report.nodesUpdated} updated · ${report.nodesRestored} restored`,
    );
    logger.log(`  notes     ${report.notesCreated} created`);
  } finally {
    await app.close();
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    new Logger("Curriculum").error(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
