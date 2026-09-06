import { Deck } from "@/database/entities";
import { InfraModule } from "@/infra/infra.module";
import { EntityManager } from "@mikro-orm/postgresql";
import { Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";
import { RealtimeTicketService } from "./realtime.ticket";
import { buildTopics, REALTIME_TOPICS } from "./realtime.topics";

/**
 * The realtime layer: one authenticated socket, and the rooms data is pushed to.
 *
 * **API process only.** The worker imports this nowhere — it serves no HTTP, so
 * it has nothing to attach a socket server to, and a second gateway in the
 * worker would be a second thing to authenticate. Notifications created by the
 * worker still appear, because the API process reads the same table.
 */
@Module({
  imports: [InfraModule],
  providers: [
    RealtimeService,
    RealtimeTicketService,
    RealtimeGateway,
    {
      /**
       * The topic registry, built here rather than in `realtime.topics.ts` so
       * that file stays free of a database dependency — and so the ownership
       * check is declared next to the module that can actually run it.
       */
      provide: REALTIME_TOPICS,
      inject: [EntityManager],
      useFactory: (em: EntityManager) =>
        buildTopics({
          deck: async (userId, deckId) =>
            // A forked manager, for the reason the generation listener forks:
            // a socket message is not a request, so there is no request-scoped
            // identity map to read, and MikroORM refuses the global one for
            // context-specific work. Without the fork this threw, `isAllowed`
            // swallowed the throw as a refusal, and every `deck:<id>` was
            // rejected as though the reader did not own their own deck.
            //
            // Scoped to the reader: a deck that exists but belongs to someone
            // else counts zero, which is the same answer as one that does not
            // exist. The refusal does not say which.
            (await em.fork().count(Deck, { id: deckId, user: userId })) > 0,
        }),
    },
  ],
  exports: [RealtimeService, RealtimeTicketService],
})
export class RealtimeModule {}
