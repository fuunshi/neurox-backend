import { defineEntity, p } from "@mikro-orm/core";
import { User } from "./user.entity";

const ActivitySchema = defineEntity({
  name: "Activity",
  tableName: "activity",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    type: p.string(),
    entityType: p.string().fieldName("entity_type"),
    entityId: p.string().fieldName("entity_id"),
    parentEntityType: p.string().fieldName("parent_entity_type").nullable(),
    parentEntityId: p.string().fieldName("parent_entity_id").nullable(),
    actor: () =>
      p
        .manyToOne(User)
        .joinColumn("actor_id")
        .inversedBy("activities")
        .nullable(),
    contextType: p.string().fieldName("context_type").nullable(),
    contextId: p.string().fieldName("context_id").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    data: p.json(),
  },
  indexes: [
    { properties: ["entityType", "entityId", "createdAt"] },
    { properties: ["contextType", "contextId", "createdAt"] },
  ],
});

export class Activity extends ActivitySchema.class {}
ActivitySchema.setClass(Activity);
