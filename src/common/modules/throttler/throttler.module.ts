import { Module, Global } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ThrottlerModule as NestThrottlerModule,
  ThrottlerGuard,
} from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

@Global()
@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: "short",
          ttl: configService.get<number>("throttler.short.ttl") || 1000,
          limit: configService.get<number>("throttler.short.limit") || 3,
        },
        {
          name: "medium",
          ttl: configService.get<number>("throttler.medium.ttl") || 10000,
          limit: configService.get<number>("throttler.medium.limit") || 20,
        },
        {
          name: "long",
          ttl: configService.get<number>("throttler.long.ttl") || 60000,
          limit: configService.get<number>("throttler.long.limit") || 100,
        },
      ],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}
