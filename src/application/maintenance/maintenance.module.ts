import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [InfraModule],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceApplicationModule {}
