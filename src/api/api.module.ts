import { Module } from "@nestjs/common";
import { ActivitiesApiModule } from "./activities-api/activities-api.module";
import { AnalyticsApiModule } from "./analytics-api/analytics-api.module";
import { AuthApiModule } from "./auth-api/auth-api.module";
import { DeckApiModule } from "./deck-api/deck-api.module";
import { GenerationApiModule } from "./generation-api/generation-api.module";
import { GraphApiModule } from "./graph-api/graph-api.module";
import { QuizApiModule } from "./quiz-api/quiz-api.module";
import { SourceApiModule } from "./source-api/source-api.module";
import { StudyApiModule } from "./study-api/study-api.module";
import { UserApiModule } from "./user-api/user-api.module";

/**
 * API Module
 * Contains only HTTP controllers for REST endpoints
 * Controllers are kept thin and delegate to application services
 */
@Module({
  imports: [
    AuthApiModule,
    UserApiModule,
    ActivitiesApiModule,
    DeckApiModule,
    SourceApiModule,
    GenerationApiModule,
    GraphApiModule,
    QuizApiModule,
    StudyApiModule,
    AnalyticsApiModule,
  ],
})
export class ApiModule {}
