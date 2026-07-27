import { Module } from "@nestjs/common";
import { AccountApplicationModule } from "./account/account.module";
import { ActivitiesApplicationModule } from "./activities/activities.module";
import { AuthApplicationModule } from "./auth/auth.module";
import { DeckApplicationModule } from "./deck/deck.module";
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
  ],
  exports: [
    AuthApplicationModule,
    UserApplicationModule,
    ActivitiesApplicationModule,
    AccountApplicationModule,
    DeckApplicationModule,
  ],
})
export class ApplicationModule {}
