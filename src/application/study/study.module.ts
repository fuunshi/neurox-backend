import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { StudyService } from "./study.service";

/**
 * Study and review scheduling.
 *
 * Depends on nothing but infrastructure: the scheduling maths is a pure
 * function, and ownership is resolved through the card's deck, so this does not
 * need the deck module and cannot grow a cycle with it.
 */
@Module({
  imports: [InfraModule],
  providers: [StudyService],
  exports: [StudyService],
})
export class StudyApplicationModule {}
