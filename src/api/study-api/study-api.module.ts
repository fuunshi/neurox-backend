import { StudyApplicationModule } from "@/application/study/study.module";
import { Module } from "@nestjs/common";
import { StudyController } from "./study.controller";

@Module({
  imports: [StudyApplicationModule],
  controllers: [StudyController],
})
export class StudyApiModule {}
