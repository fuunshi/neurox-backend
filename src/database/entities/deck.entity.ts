import { softDeleteFilters } from "../filters/soft-delete.filter";
import { GenerationJob } from "./generation-job.entity";
import { FlashCard } from "./flash-card.entity";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * A user-owned collection of flash cards. Cards always belong to exactly one
 * deck, and a deck always belongs to exactly one user.
 */
const DeckSchema = defineEntity({
  name: "Deck",
  tableName: "deck",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).joinColumn("user_id").inversedBy("decks"),
    title: p.string(),
    description: p.text().nullable(),
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
    cards: () => p.oneToMany(FlashCard).mappedBy("deck"),
    generationJobs: () => p.oneToMany(GenerationJob).mappedBy("deck"),
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["user"] },
    { properties: ["deletedAt"] },
    // Decks are always listed per user, newest first.
    { properties: ["user", "createdAt"] },
  ],
});

export class Deck extends DeckSchema.class {}
DeckSchema.setClass(Deck);
