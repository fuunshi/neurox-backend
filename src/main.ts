import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { ConfigService } from "@nestjs/config";
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

  const configService = app.get(ConfigService);

  /**
   * Socket.IO attaches to Fastify's underlying HTTP server, so the realtime
   * gateway shares this port rather than opening another. Registered before
   * `listen` because the adapter has to be in place when the server is created.
   *
   * The worker does not do this: it imports no gateway, serves no HTTP, and a
   * second socket server there would be a second thing to authenticate.
   */
  app.useWebSocketAdapter(new IoAdapter(app));

  await app.register(compression);

  /**
   * An allowlist from config, and no `credentials`. Auth is a Bearer header, so
   * no cookie ever rides a cross-origin call and claiming credentials support
   * was misleading as well as unusable: browsers reject `origin: "*"` combined
   * with `credentials: true` outright, which is what the previous pair was.
   */
  app.enableCors({
    origin: configService.get<string[]>("app.corsOrigins"),
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
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
