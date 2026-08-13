import { Module } from "@nestjs/common";
import { AccountWorkerModule } from "./workers/account/account.worker.module";
import { EmailWorkerModule } from "./workers/email";
import { GenerationWorkerModule } from "./workers/generation/generation.worker.module";
import { InfraModule } from "@/infra/infra.module";

@Module({
  imports: [
    InfraModule,
    EmailWorkerModule,
    AccountWorkerModule,
    GenerationWorkerModule,
  ],
})
export class WorkerModule {}
