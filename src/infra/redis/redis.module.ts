import { ConfigModule } from "@/infra/config/config.module";
import { Module } from "@nestjs/common";
import { RedisService } from "./redis.service";
import { RedisModule as NestRedisModule } from "@nestjs-modules/ioredis";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
    NestRedisModule.forRootAsync({
      // Nest 12 requires `imports` to be declared on async options even when
      // the provider comes from a @Global() module.
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "single",
        url: config.getOrThrow<string>("redis.url"),
        options: {
          retryStrategy: (times) => Math.min(times * 50, 2000),
        },
      }),
    }),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
