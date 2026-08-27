import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SeederService, DEMO_EMAIL, DEMO_PASSWORD } from "./seeder.service";
import { SeederModule } from "./seeder.module";

/**
 * Populates a demo account, from the command line.
 *
 *   pnpm seed
 *
 * Run it whenever a fresh, fully-populated account is wanted. It removes the
 * demo account's existing data first, so it is safe to run repeatedly and
 * always leaves the same account.
 */
async function bootstrap() {
  const logger = new Logger("Seed");

  const app = await NestFactory.createApplicationContext(SeederModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const seeder = app.get(SeederService);
    const report = await seeder.seed();

    logger.log("Demo account ready");
    logger.log(`  email     ${report.email}`);
    logger.log(`  password  ${DEMO_PASSWORD}`);
    logger.log(
      `  history   ${report.daysOfHistory} days · ${report.reviews} reviews · ${report.streak}-day streak`,
    );
    logger.log(`  material  ${report.decks} decks · ${report.cards} cards`);
    logger.log(`  sources   ${report.sources}`);
    logger.log(`  quizzes   ${report.quizzes} completed`);
    logger.log(`  due now   ${report.dueNow} cards`);
  } finally {
    await app.close();
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    new Logger("Seed").error(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
