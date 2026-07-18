import { Module } from "@nestjs/common";
import { GeminiModule } from "./gemini/gemini.module";

/**
 * Integrations Module
 * Aggregates all third-party integrations (Gemini, external APIs, etc.)
 * Centralizes external service configurations and dependencies
 */
@Module({
  imports: [GeminiModule],
  exports: [GeminiModule],
})
export class IntegrationsModule {}
