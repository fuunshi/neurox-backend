import { NotificationApplicationModule } from "@/application/notification/notification.module";
import { Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller";

@Module({
  imports: [NotificationApplicationModule],
  controllers: [NotificationController],
})
export class NotificationApiModule {}
