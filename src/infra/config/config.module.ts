import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import accountConfig from "./account.config";
import appConfig from "./app.config";
import authConfig from "./auth.config";
import databaseConfig from "./database.config";
import rabbitmqConfig from "./rabbitmq.config";
import redisConfig from "./redis.config";
import smtpConfig from "./smtp.config";
import throttlerConfig from "./throttler.config";

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        accountConfig,
        databaseConfig,
        redisConfig,
        throttlerConfig,
        rabbitmqConfig,
        smtpConfig,
      ],
      envFilePath: [".env", ".env.local"],
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
