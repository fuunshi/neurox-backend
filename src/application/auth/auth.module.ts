import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { InfraModule } from "@/infra/infra.module";
import { UserApplicationModule } from "../user/user.module";
import { NotificationApplicationModule } from "../notification/notification.module";

@Module({
  imports: [InfraModule, UserApplicationModule, NotificationApplicationModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthApplicationModule {}
