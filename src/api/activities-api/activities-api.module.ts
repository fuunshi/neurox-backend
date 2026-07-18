import { Module } from "@nestjs/common";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesApplicationModule } from "@/application/activities/activities.module";

@Module({
  imports: [ActivitiesApplicationModule],
  controllers: [ActivitiesController],
})
export class ActivitiesApiModule {}
