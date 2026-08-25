import { ActivitiesApplicationModule } from "@/application/activities/activities.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { QuizService } from "./quiz.service";

/**
 * Quizzes.
 *
 * No queue and no worker, unlike card generation: a quiz is built from cards
 * that already exist, so setting one is a few reads and an insert rather than a
 * job. `ActivitiesApplicationModule` is imported because starting and finishing
 * an attempt are recorded in the feed like every other domain event.
 */
@Module({
  imports: [InfraModule, ActivitiesApplicationModule],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizApplicationModule {}
