import { Module } from "@nestjs/common";
import { ActivitiesApiModule } from "./activities-api/activities-api.module";
import { AuthApiModule } from "./auth-api/auth-api.module";
import { DeckApiModule } from "./deck-api/deck-api.module";
import { SourceApiModule } from "./source-api/source-api.module";
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
  ],
})
export class ApiModule {}
