import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConsoleLogger } from "@nestjs/common";
import compression from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { SOURCE_LIMITS } from "./common/constant/source.constant";
import { AppLoggerService } from "./common";
import { enableGracefulShutdown } from "./common/utils/shutdown/graceful-shutdown.util";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const appLogger = app.get(AppLoggerService);
  app.useLogger(appLogger);

  await app.register(compression);

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });

  await app.register(fastifyHelmet);

  // Required for `POST /sources/upload`. The limit is enforced here as well as
  // in the service so an oversized body is rejected before it is buffered.
  await app.register(multipart, {
    limits: { fileSize: SOURCE_LIMITS.MAX_UPLOAD_BYTES },
  });

  const config = new DocumentBuilder()
    .setTitle("neurox AI API")
    .setDescription("API Documentation for neurox AI.")
    .setVersion("1.0")
    .addTag("neurox AI")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");

  // Registered after listen so signals arriving during startup are not handled
  // against a server that is not accepting yet.
  enableGracefulShutdown(app, { logger: appLogger });
}
void bootstrap();
