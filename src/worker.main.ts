import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker/worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const logger = new Logger("WorkerBootstrap");
  logger.log("BullMQ worker context started and waiting for jobs");

  await app.init();
}

void bootstrap();
