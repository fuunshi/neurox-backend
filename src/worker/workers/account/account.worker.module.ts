import { AccountApplicationModule } from "@/application/account/account.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { AccountRecycleScheduler } from "./account-recycle.scheduler";
import { AccountWorkerProcessor } from "./account.worker.processor";

@Module({
  imports: [InfraModule, AccountApplicationModule],
  providers: [AccountWorkerProcessor, AccountRecycleScheduler],
})
export class AccountWorkerModule {}
