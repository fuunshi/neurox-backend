import { ActivitiesApplicationModule } from "@/application/activities/activities.module";
import { SourceApplicationModule } from "@/application/source/source.module";
import { InfraModule } from "@/infra/infra.module";
import { IntegrationsModule } from "@/integrations/integrations.module";
import { Module } from "@nestjs/common";
import { GenerationService } from "./generation.service";
import {
  CARD_GENERATORS,
  type CardGenerator,
} from "./generators/card-generator.interface";
import { GeminiCardGenerator } from "./generators/gemini.generator";
import { HeuristicCardGenerator } from "./generators/heuristic.generator";
import { NlpCardGenerator } from "./generators/nlp.generator";

/**
 * Card generation.
 *
 * Both generators are registered rather than one being chosen at wiring time,
 * because the choice depends on the environment: Gemini is preferred when a key
 * is configured, and the heuristic generator takes over when it is not. The
 * service picks per job and records which ran, so the switch is a config change
 * rather than a deployment.
 *
 * `SourceApplicationModule` supplies `ChunkingService`; `IntegrationsModule`
 * supplies the Gemini client. The queue is reached through the global
 * `QueueModule`, so it needs no import here.
 */
@Module({
  imports: [
    InfraModule,
    SourceApplicationModule,
    ActivitiesApplicationModule,
    IntegrationsModule,
  ],
  providers: [
    GenerationService,
    HeuristicCardGenerator,
    GeminiCardGenerator,
    NlpCardGenerator,
    {
      provide: CARD_GENERATORS,
      inject: [NlpCardGenerator, GeminiCardGenerator, HeuristicCardGenerator],
      // **The order here is deliberately not the preference order.** That lives
      // in `GenerationService.defaultGenerator`, written out explicitly, so
      // that changing which generator runs is a change to a list in the file
      // that decides it rather than to an array that looks cosmetic. This
      // collection is the set of what exists; that method is the choice.
      useFactory: (
        nlp: CardGenerator,
        gemini: CardGenerator,
        heuristic: CardGenerator,
      ): CardGenerator[] => [nlp, gemini, heuristic],
    },
  ],
  exports: [GenerationService],
})
export class GenerationApplicationModule {}
