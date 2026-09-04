import { Module } from "@nestjs/common";
import { AccountApplicationModule } from "./account/account.module";
import { ActivitiesApplicationModule } from "./activities/activities.module";
import { AnalyticsApplicationModule } from "./analytics/analytics.module";
import { AuthApplicationModule } from "./auth/auth.module";
import { DeckApplicationModule } from "./deck/deck.module";
import { GenerationApplicationModule } from "./generation/generation.module";
import { GenerationEventsModule } from "./generation/generation-events.module";
import { GraphApplicationModule } from "./graph/graph.module";
import { NotificationApplicationModule } from "./notification/notification.module";
import { QuizApplicationModule } from "./quiz/quiz.module";
import { SourceApplicationModule } from "./source/source.module";
import { StudyApplicationModule } from "./study/study.module";
import { UserApplicationModule } from "./user/user.module";

/**
 * Application Module
 * Contains all core business logic and services
 * Separates domain logic from HTTP controllers
 * Dependencies are injected from infrastructure layer
 */
@Module({
  imports: [
    AuthApplicationModule,
    UserApplicationModule,
    ActivitiesApplicationModule,
    AccountApplicationModule,
    DeckApplicationModule,
    SourceApplicationModule,
    GenerationApplicationModule,
    GenerationEventsModule,
    GraphApplicationModule,
    NotificationApplicationModule,
    QuizApplicationModule,
    StudyApplicationModule,
    AnalyticsApplicationModule,
  ],
  exports: [
    AuthApplicationModule,
    UserApplicationModule,
    ActivitiesApplicationModule,
    AccountApplicationModule,
    DeckApplicationModule,
    SourceApplicationModule,
    GenerationApplicationModule,
    GenerationEventsModule,
    GraphApplicationModule,
    NotificationApplicationModule,
    QuizApplicationModule,
    StudyApplicationModule,
    AnalyticsApplicationModule,
  ],
})
export class ApplicationModule {}
