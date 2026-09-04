import { ActivitiesApplicationModule } from "@/application/activities/activities.module";
import { NotificationApplicationModule } from "@/application/notification/notification.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { DeckService } from "./deck.service";

@Module({
  imports: [
    InfraModule,
    ActivitiesApplicationModule,
    NotificationApplicationModule,
  ],
  providers: [DeckService],
  exports: [DeckService],
})
export class DeckApplicationModule {}
