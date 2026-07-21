import { Module } from "@nestjs/common";
import { AccountApplicationModule } from "@/application/account/account.module";
import { UserService } from "./user.service";
import { InfraModule } from "@/infra/infra.module";

@Module({
  imports: [InfraModule, AccountApplicationModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserApplicationModule {}
