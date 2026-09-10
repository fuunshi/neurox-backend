import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { InfraModule } from "@/infra/infra.module";
import { HealthController } from "./health.controller";
import { LivenessService } from "./liveness.service";
import { QueueHealthIndicator } from "./queue.health";
import { RedisHealthIndicator } from "./redis.health";

/**
 * Metrics and health — deliberately not the application's API.
 *
 * This module is at `src/observability/` rather than under `src/api/`, which
 * ARCHITECTURE.md defines as "controllers only, one folder per feature". These
 * are not features: they are not for readers, they are not in the app's
 * navigation, they carry no auth context, and none of them should ever appear in
 * the Swagger document as something a client might call.
 */
@Module({
  imports: [TerminusModule, InfraModule],
  controllers: [HealthController],
  providers: [LivenessService, RedisHealthIndicator, QueueHealthIndicator],
})
export class ObservabilityModule {}
