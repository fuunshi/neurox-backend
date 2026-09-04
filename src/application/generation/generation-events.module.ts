import { NotificationApplicationModule } from "@/application/notification/notification.module";
import { InfraModule } from "@/infra/infra.module";
import { RealtimeModule } from "@/realtime/realtime.module";
import { Module } from "@nestjs/common";
import { GenerationEventsListener } from "./generation-events.listener";

/**
 * The bridge from "a generation run finished" to "the reader's screen says so".
 *
 * ## Why this is not part of `GenerationApplicationModule`
 *
 * The **worker** imports that module directly, to run the very same generation
 * rules. A listener declared there would therefore be constructed in both
 * processes, and both would hear the same BullMQ completion and write the same
 * notification — so every generation would arrive twice.
 *
 * This module is imported by `ApplicationModule`, which only the API's
 * composition root pulls in. The worker never sees it, and the socket stays in
 * the process that has one.
 */
@Module({
  imports: [InfraModule, NotificationApplicationModule, RealtimeModule],
  providers: [GenerationEventsListener],
})
export class GenerationEventsModule {}
