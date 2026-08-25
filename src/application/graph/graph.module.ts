import { InfraModule } from "@/infra/infra.module";
import { Module } from "@nestjs/common";
import { GraphService } from "./graph.service";

/**
 * The knowledge graph.
 *
 * Needs `InfraModule` for the `EntityManager` and nothing else — it reads what
 * other modules already wrote, and writes nothing of its own. That is a
 * property worth keeping: when the term layer becomes real, the extraction
 * belongs in its own module and this one keeps reading from it.
 */
@Module({
  imports: [InfraModule],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphApplicationModule {}
