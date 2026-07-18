import { Module } from "@nestjs/common";
import { ActivitiesService } from "./activities.service";
import { InfraModule } from "@/infra/infra.module";

@Module({
  imports: [InfraModule],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesApplicationModule {}
