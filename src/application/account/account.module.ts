import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { AccountLifecycleService } from "./account-lifecycle.service";

@Module({
  imports: [InfraModule],
  providers: [AccountLifecycleService],
  exports: [AccountLifecycleService],
})
export class AccountApplicationModule {}
