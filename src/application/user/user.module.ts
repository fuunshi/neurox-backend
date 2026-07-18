import { Module } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserRepository } from "./user.repository";
import { InfraModule } from "@/infra/infra.module";

@Module({
  imports: [InfraModule],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserApplicationModule {}
