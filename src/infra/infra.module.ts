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
