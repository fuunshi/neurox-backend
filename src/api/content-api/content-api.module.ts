import { ContentApplicationModule } from "@/application/content/content.module";
import { Module } from "@nestjs/common";
import { ContentController } from "./content.controller";

@Module({
  imports: [ContentApplicationModule],
  controllers: [ContentController],
})
export class ContentApiModule {}
