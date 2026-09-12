import { Global, Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { QueueMetricsService } from "./queue.metrics";

/**
 * Metrics, as infrastructure.
 *
 * `@Global()` for the same reason `QueueModule` and `SettingsModule` are: the
 * registry is incremented from whichever application service does the thing
 * being counted, and threading an import through every feature module to reach
 * one counter is how instrumentation stops being added.
 *
 * `QueueMetricsService` is provided here rather than in the observability module
 * because it needs `@InjectQueue`, and the queues belong to `InfraModule` — this
 * module is imported by it, so the tokens resolve.
 */
@Global()
@Module({
  providers: [MetricsService, QueueMetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
