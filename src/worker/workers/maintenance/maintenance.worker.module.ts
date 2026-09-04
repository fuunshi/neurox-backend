import { MaintenanceApplicationModule } from "@/application/maintenance/maintenance.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { MaintenanceScheduler } from "./maintenance.scheduler";
import { MaintenanceWorkerProcessor } from "./maintenance.worker.processor";

@Module({
  imports: [InfraModule, MaintenanceApplicationModule],
  providers: [MaintenanceWorkerProcessor, MaintenanceScheduler],
})
export class MaintenanceWorkerModule {}
