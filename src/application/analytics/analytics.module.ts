import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";

/**
 * Reporting over what has already happened.
 *
 * Reads only: nothing here writes, and nothing here sits on a path a review or
 * a generation job depends on. It needs infrastructure and no other application
 * module — every figure is an aggregate over tables it can reach through the
 * entity manager, which is what keeps it from growing a cycle with study, quiz
 * or generation later.
 */
@Module({
  imports: [InfraModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsApplicationModule {}
