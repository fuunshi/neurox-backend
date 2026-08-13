import { GenerationApplicationModule } from "@/application/generation/generation.module";
import { Module } from "@nestjs/common";
import { GenerationController } from "./generation.controller";

@Module({
  imports: [GenerationApplicationModule],
  controllers: [GenerationController],
})
export class GenerationApiModule {}
