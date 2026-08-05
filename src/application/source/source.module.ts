import { ActivitiesApplicationModule } from "@/application/activities/activities.module";
import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { ChunkingService } from "./chunking.service";
import { DocxExtractor } from "./extractors/docx.extractor";
import { ExtractorRegistry } from "./extractors/extractor.registry";
import { PdfExtractor } from "./extractors/pdf.extractor";
import { PlainTextExtractor } from "./extractors/plain-text.extractor";
import { SourceService } from "./source.service";

@Module({
  imports: [InfraModule, ActivitiesApplicationModule],
  providers: [
    SourceService,
    ChunkingService,
    ExtractorRegistry,
    PlainTextExtractor,
    PdfExtractor,
    DocxExtractor,
  ],
  // ChunkingService is exported for phase 3's generators, which consume chunks.
  exports: [SourceService, ChunkingService],
})
export class SourceApplicationModule {}
