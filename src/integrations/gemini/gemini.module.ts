import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { GeminiClient } from "./gemini.client";

@Module({
  providers: [GeminiService, GeminiClient],
  exports: [GeminiService, GeminiClient],
})
export class GeminiModule {}
