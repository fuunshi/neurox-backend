import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { ActivitiesService } from "./activities.service";
import { ActivityRecorderService } from "./activity-recorder.service";

@Module({
  imports: [InfraModule],
  providers: [ActivitiesService, ActivityRecorderService],
  exports: [ActivitiesService, ActivityRecorderService],
})
export class ActivitiesApplicationModule {}
