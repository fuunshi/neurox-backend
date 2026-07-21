import { Module } from "@nestjs/common";
import { AccountWorkerModule } from "./workers/account/account.worker.module";
import { EmailWorkerModule } from "./workers/email";
import { InfraModule } from "@/infra/infra.module";

@Module({
  imports: [InfraModule, EmailWorkerModule, AccountWorkerModule],
})
export class WorkerModule {}
