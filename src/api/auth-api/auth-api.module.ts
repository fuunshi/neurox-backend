import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccountApplicationModule } from "@/application/account/account.module";
import { AuthApplicationModule } from "@/application/auth/auth.module";

@Module({
  imports: [AuthApplicationModule, AccountApplicationModule],
  controllers: [AuthController],
})
export class AuthApiModule {}
