import { Module } from "@nestjs/common";
import { EmailWorkerModule } from "./workers/email";
import { InfraModule } from "@/infra/infra.module";

@Module({
  imports: [InfraModule, EmailWorkerModule],
})
export class WorkerModule {}
