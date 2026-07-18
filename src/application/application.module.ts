import { Module } from "@nestjs/common";
import { ActivitiesApplicationModule } from "./activities/activities.module";
import { AuthApplicationModule } from "./auth/auth.module";
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
    ],
    exports: [
        AuthApplicationModule,
        UserApplicationModule,
        ActivitiesApplicationModule,
    ],
})
export class ApplicationModule { }
