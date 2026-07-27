import { softDeleteFilters } from "../filters/soft-delete.filter";
import { GENERATION_JOB_STATUS } from "@/common/constant/enums/generation-job-status.enum";
import { Deck } from "./deck.entity";
import { FlashCard } from "./flash-card.entity";
import { Source } from "./source.entity";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * One run of turning a `Source` into cards in a `Deck`.
 *
 * `provider` and `model` are recorded per run rather than assumed globally:
 * the generation backend is expected to change (LLM now, a locally trained
 * model later), and comparing the output of two providers on the same source
 * requires knowing which one produced which cards.
 */
const GenerationJobSchema = defineEntity({
  name: "GenerationJob",
  tableName: "generation_job",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () =>
      p.manyToOne(User).joinColumn("user_id").inversedBy("generationJobs"),
    source: () =>
      p.manyToOne(Source).joinColumn("source_id").inversedBy("generationJobs"),
    deck: () =>
      p.manyToOne(Deck).joinColumn("deck_id").inversedBy("generationJobs"),
    status: p
      .enum(() => GENERATION_JOB_STATUS)
      .nativeEnumName("generation_job_status")
      .default(GENERATION_JOB_STATUS.PENDING),
    /** Which generator ran, e.g. `heuristic`, `gemini`, `local`. */
    provider: p.string(),
    /** Specific model within that provider, e.g. `gemini-2.5-pro`. */
    model: p.string().nullable(),
    cardsRequested: p.integer().fieldName("cards_requested").nullable(),
    cardsCreated: p.integer().fieldName("cards_created").default(0),
    error: p.text().nullable(),
    startedAt: p.datetime().fieldName("started_at").nullable(),
    finishedAt: p.datetime().fieldName("finished_at").nullable(),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .fieldName("updated_at")
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
    cards: () => p.oneToMany(FlashCard).mappedBy("generationJob"),
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["user"] },
    { properties: ["source"] },
    { properties: ["deck"] },
    { properties: ["status"] },
    { properties: ["deletedAt"] },
    { properties: ["user", "createdAt"] },
  ],
});

export class GenerationJob extends GenerationJobSchema.class {}
GenerationJobSchema.setClass(GenerationJob);
