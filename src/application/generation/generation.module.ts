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
    {
      provide: CARD_GENERATORS,
      inject: [GeminiCardGenerator, HeuristicCardGenerator],
      // Ordered best-first. `GenerationService.defaultGenerator` still filters
      // by `isAvailable()` and prefers Gemini explicitly, so the order here is a
      // fallback rather than the decision.
      useFactory: (
        gemini: CardGenerator,
        heuristic: CardGenerator,
      ): CardGenerator[] => [gemini, heuristic],
    },
  ],
  exports: [GenerationService],
})
export class GenerationApplicationModule {}
