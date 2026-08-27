import { ActivitiesApplicationModule } from "@/application/activities/activities.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { SeederService } from "./seeder.service";

/**
 * The demo seeder.
 *
 * Boots only what it needs — the database and the activity recorder — rather
 * than the whole `AppModule`. The seeder writes rows directly instead of going
 * through the domain services, because those services stamp *now* on everything
 * they touch and a demo needs its history to be in the past.
 *
 * That is a deliberate exception, and it is why this module is separate: it is
 * a tool for populating a database, not part of serving one.
 */
@Module({
  imports: [InfraModule, ActivitiesApplicationModule],
  providers: [SeederService],
})
export class SeederModule {}
