import { InfraModule } from "@/infra/infra.module";
import { IntegrationsModule } from "@/integrations/integrations.module";
import { Module } from "@nestjs/common";
import { CardImproverService } from "./card-improver.service";
import { StudyService } from "./study.service";

/**
 * Study and review scheduling.
 *
 * Scheduling depends on nothing but infrastructure: the maths is a pure function
 * and ownership is resolved through the card's deck, so this needs neither the
 * deck nor the generation module and cannot grow a cycle with either.
 *
 * Card improvement needs the Gemini client, which is why `IntegrationsModule` is
 * here. It is a study concern rather than a generation one — it responds to a
 * card being forgotten, not to a source being read.
 */
@Module({
  imports: [InfraModule, IntegrationsModule],
  providers: [StudyService, CardImproverService],
  exports: [StudyService, CardImproverService],
})
export class StudyApplicationModule {}
