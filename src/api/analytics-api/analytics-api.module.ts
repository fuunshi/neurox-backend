import { AnalyticsApplicationModule } from "@/application/analytics/analytics.module";
import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";

@Module({
  imports: [AnalyticsApplicationModule],
  controllers: [AnalyticsController],
})
export class AnalyticsApiModule {}
