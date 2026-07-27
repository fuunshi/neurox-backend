import { ActivitiesApplicationModule } from "@/application/activities/activities.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { DeckService } from "./deck.service";

@Module({
  imports: [InfraModule, ActivitiesApplicationModule],
  providers: [DeckService],
  exports: [DeckService],
})
export class DeckApplicationModule {}
