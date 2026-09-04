import { softDeleteFilters } from "../filters/soft-delete.filter";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * One thing worth telling a reader about.
 *
 * Deliberately holds **no rendered text**. A row is a template key plus the
 * parameters that template needs — `CARDS_GENERATED` and
 * `{ deckId, deckTitle, count }` — and the title, body and destination are
 * produced from `notification.templates.ts` when the row is read or pushed.
 *
 * That is what makes the message changeable after the fact. Storing "12 cards
 * are ready" freezes the wording, the language and the link of every
 * notification ever sent; storing the facts means a reworded template rewords
 * the whole history, and a reader who changes language sees their old
 * notifications in the new one.
 *
 * It also keeps the payload small and makes the row safe to inspect: a
 * notification cannot smuggle content in, because it only names a template the
 * server already knows.
 */
const NotificationSchema = defineEntity({
  name: "Notification",
  tableName: "notification",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).joinColumn("user_id"),
    /** A key in `NOTIFICATION_TEMPLATES`. Unknown keys are skipped on read
     *  rather than thrown on, so an old row survives a template being renamed. */
    type: p.string().length(64),
    /** The template's arguments. Shape is the template's business, not the
     *  column's — it is validated by the template when it renders. */
    params: p.json(),
    readAt: p.datetime().fieldName("read_at").nullable(),
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
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["user"] },
    // The unread count is the one read this table gets constantly, and it is
    // always these two columns together.
    { properties: ["user", "readAt"] },
    // Listing is newest first, per reader.
    { properties: ["user", "createdAt"] },
    { properties: ["deletedAt"] },
  ],
});

export class Notification extends NotificationSchema.class {}
NotificationSchema.setClass(Notification);
