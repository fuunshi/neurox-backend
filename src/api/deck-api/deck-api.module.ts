import { DeckApplicationModule } from "@/application/deck/deck.module";
import { Module } from "@nestjs/common";
import { DeckController } from "./deck.controller";

@Module({
  imports: [DeckApplicationModule],
  controllers: [DeckController],
})
export class DeckApiModule {}
