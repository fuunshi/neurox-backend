import { AuditModule } from "@/infra/audit/audit.module";
import { ConfigModule } from "@/infra/config/config.module";
import { LoggerModule } from "@/infra/logger/logger.module";
import { MailQueueModule } from "@/infra/mail-queue/mail-queue.module";
import { QueueModule } from "@/infra/queue/queue.module";
import { SettingsModule } from "@/infra/settings/settings.module";
import { ThrottlerModule } from "@/infra/throttler/throttler.module";
import { TokenModule } from "@/infra/token/token.module";
import { DatabaseModule } from "@/database/database.module";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

/**
 * Infrastructure Module
 * Aggregates all infrastructure-related modules including:
 * - Configuration
 * - Database (MikroORM)
 * - Cache (Redis)
 * - Messaging (Mail Queue, Bull MQ)
 * - Audit logging
 * - Application logging
 * - Token management
 * - Rate limiting (Throttler)
 * - JWT signing
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    // RedisModule,
    AuditModule,
    LoggerModule,
    MailQueueModule,
    QueueModule,
    SettingsModule,
    ThrottlerModule,
    TokenModule,
    /**
     * Registered here rather than in AppModule because *both* entrypoints need
     * it. `TokenService` injects `JwtService`, and the worker reaches that
     * service through this module — with the registration living only in the
     * HTTP composition root, the worker died during bootstrap on an unresolvable
     * `JwtService` dependency. Since that worker is the only consumer of the
     * mail queue, the effect was that no email was ever delivered by either
     * runtime: no verification links, no password resets, no welcome mail.
     *
     * `global: true` keeps `AuthGuard` working, since it injects `JwtService`
     * too.
     */
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("auth.jwtSecret"),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            "auth.jwtExpiresIn",
          ) as `${number}${"s" | "m" | "h" | "d"}`,
        },
      }),
    }),
  ],
  exports: [
    ConfigModule,
    DatabaseModule,
    // RedisModule,
    AuditModule,
    LoggerModule,
    MailQueueModule,
    QueueModule,
    SettingsModule,
    ThrottlerModule,
    TokenModule,
  ],
})
export class InfraModule {}
