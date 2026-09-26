import { Module } from "@nestjs/common";
import { ContentService } from "./content.service";
import { TaxonomyService } from "./taxonomy.service";

/**
 * The public study-material model.
 *
 * No `InfraModule` import, unlike its neighbours: nothing here reads config,
 * queues anything, or sends mail. It is a read path over two tables, and that
 * is the whole of it — which is also why every endpoint it feeds is safe to
 * serve anonymously and cache.
 */
@Module({
  providers: [ContentService, TaxonomyService],
  exports: [ContentService, TaxonomyService],
})
export class ContentApplicationModule {}
