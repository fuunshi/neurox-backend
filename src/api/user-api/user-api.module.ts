import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserApplicationModule } from "@/application/user/user.module";

@Module({
  imports: [UserApplicationModule],
  controllers: [UserController],
})
export class UserApiModule {}
