import { SourceApplicationModule } from "@/application/source/source.module";
import { Module } from "@nestjs/common";
import { SourceController } from "./source.controller";

@Module({
  imports: [SourceApplicationModule],
  controllers: [SourceController],
})
export class SourceApiModule {}
