import { InfraModule } from "@/infra/infra.module";
import { RealtimeModule } from "@/realtime/realtime.module";
import { Module } from "@nestjs/common";
import { NotificationService } from "./notification.service";

@Module({
  imports: [InfraModule, RealtimeModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationApplicationModule {}
