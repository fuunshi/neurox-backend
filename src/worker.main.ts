import { enableGracefulShutdown } from "./common/utils/shutdown/graceful-shutdown.util";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker/worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const logger = new Logger("WorkerBootstrap");
  logger.log("BullMQ worker context started and waiting for jobs");

  await app.init();

  // No HTTP server here, so this drains on a short grace period rather than
  // waiting for connections to end. BullMQ lets an in-flight job finish.
  enableGracefulShutdown(app, { logger });
}

void bootstrap();
