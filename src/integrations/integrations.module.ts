import { Module } from "@nestjs/common";
import { GeminiModule } from "./gemini/gemini.module";
import { NeuroxBrainModule } from "./neurox-brain/neurox-brain.module";

/**
 * Integrations Module
 * Aggregates all third-party integrations (Gemini, external APIs, etc.)
 * Centralizes external service configurations and dependencies
 *
 * `NeuroxBrainModule` is not third-party — it is our own service — but it
 * belongs here for the same reason the others do: it is a thing this process
 * reaches over a network, with its own configuration, its own failure modes and
 * its own client. Where the code lives is a more useful distinction than who
 * wrote it.
 */
@Module({
  imports: [GeminiModule, NeuroxBrainModule],
  exports: [GeminiModule, NeuroxBrainModule],
})
export class IntegrationsModule {}
