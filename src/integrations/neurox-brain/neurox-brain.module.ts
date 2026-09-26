import { Module } from "@nestjs/common";
import { NeuroxBrainClient } from "./neurox-brain.client";

/**
 * The `neurox-brain` integration.
 *
 * Exported rather than `@Global`, like the Gemini integration beside it: the
 * only consumer is the generation module, and a global would make it reachable
 * from everywhere without anyone deciding that it should be.
 */
@Module({
  providers: [NeuroxBrainClient],
  exports: [NeuroxBrainClient],
})
export class NeuroxBrainModule {}
