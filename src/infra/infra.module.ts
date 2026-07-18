import { AuditModule } from "@/common/modules/audit/audit.module";
import { ConfigModule } from "@/common/modules/config/config.module";
import { LoggerModule } from "@/common/modules/logger/logger.module";
import { MailQueueModule } from "@/common/modules/mail-queue/mail-queue.module";
import { PrismaModule } from "@/common/modules/prisma/prisma.module";
import { QueueModule } from "@/common/modules/queue/queue.module";
import { ThrottlerModule } from "@/common/modules/throttler/throttler.module";
import { TokenModule } from "@/common/modules/token/token.module";
import { Module } from "@nestjs/common";

/**
 * Infrastructure Module
 * Aggregates all infrastructure-related modules including:
 * - Configuration
 * - Database (Prisma)
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
        PrismaModule,
        // RedisModule,
        AuditModule,
        LoggerModule,
        MailQueueModule,
        QueueModule,
        ThrottlerModule,
        TokenModule,
    ],
    exports: [
        ConfigModule,
        PrismaModule,
        // RedisModule,
        AuditModule,
        LoggerModule,
        MailQueueModule,
        QueueModule,
        ThrottlerModule,
        TokenModule,
    ],
})
export class InfraModule { }
