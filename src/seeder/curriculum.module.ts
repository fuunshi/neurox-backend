import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { CurriculumService } from "./curriculum.service";

/**
 * The syllabus bootstrap.
 *
 * Separate from `SeederModule` on purpose. That one builds a demo reader with a
 * fabricated history and is a development tool; this one installs reference
 * data that every environment needs, which is why it is a different command
 * with a different lifetime. Sharing a module would invite running one to get
 * the other.
 *
 * Imports `InfraModule` for the database and nothing else — it writes two
 * tables and touches no queue, no mail and no cache.
 */
@Module({
  imports: [InfraModule],
  providers: [CurriculumService],
})
export class CurriculumModule {}
