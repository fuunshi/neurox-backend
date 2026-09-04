import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccountApplicationModule } from "@/application/account/account.module";
import { AuthApplicationModule } from "@/application/auth/auth.module";
import { RealtimeModule } from "@/realtime/realtime.module";

@Module({
  imports: [AuthApplicationModule, AccountApplicationModule, RealtimeModule],
  controllers: [AuthController],
})
export class AuthApiModule {}
