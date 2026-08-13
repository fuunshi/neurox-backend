import { GenerationApplicationModule } from "@/application/generation/generation.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { GenerationWorkerProcessor } from "./generation.worker.processor";

/**
 * Imports the application module rather than re-declaring the service, so the
 * worker and the API share exactly one implementation of the generation rules.
 */
@Module({
  imports: [InfraModule, GenerationApplicationModule],
  providers: [GenerationWorkerProcessor],
})
export class GenerationWorkerModule {}
