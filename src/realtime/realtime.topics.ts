/**
 * What a socket may subscribe to, and who is allowed to.
 *
 * The socket exists for notifications first, but the connection is expensive to
 * build and cheap to reuse — so the same connection carries whatever else needs
 * to reach a reader without them asking. That is what this registry is for: a
 * place to declare a new stream of data in one entry, with its authorization
 * next to it, rather than a second socket or a second mechanism.
 *
 * ## The rule this file exists to enforce
 *
 * A subscription is a **read**, and it must be authorized like one. A client
 * sends a topic name and, in general, an id — and without a check, `deck:<any
 * uuid>` would stream a stranger's generation progress to anyone who guessed an
 * id. So every topic declares a `canSubscribe`, the gateway calls it before
 * joining the room, and the default is to refuse rather than to allow.
 *
 * Topics carry no payload of their own; they are just rooms. The events sent to
 * them are declared in `realtime.types.ts`.
 */

/** Rooms a socket can end up in. Prefixing the user room keeps a hand-crafted
 *  topic name from colliding with it: a client asking for `user:<id>` as a
 *  topic finds no topic of that name and is refused. */
export const ROOM_PREFIX = {
  USER: "user:",
} as const;

export function userRoom(userId: string): string {
  return `${ROOM_PREFIX.USER}${userId}`;
}

export interface TopicDefinition {
  /** Whether this reader may subscribe, given the id they asked for. */
  canSubscribe: (userId: string, id: string) => Promise<boolean>;
}

export interface ResolvedTopic {
  room: string;
  definition: TopicDefinition;
}

/** Injection token for the built registry, so the module owns the database
 *  access the ownership checks need and this file stays free of it. */
export const REALTIME_TOPICS = Symbol("REALTIME_TOPICS");

export type TopicRegistry = Record<string, TopicDefinition>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The declared topics, keyed by the name clients send.
 *
 * `deck` is the first real one: the deck screen wants to know when a generation
 * run over that deck finishes, rather than asking every 1.5 seconds. Ownership
 * is delegated to a checker the module injects, because this file should not
 * need a database.
 */
export function buildTopics(owns: {
  deck: (userId: string, deckId: string) => Promise<boolean>;
}): Record<string, TopicDefinition> {
  return {
    deck: {
      canSubscribe: async (userId, id) =>
        // Checked before the query: a malformed id is not a "no", it is a
        // question that should not be asked of the database at all.
        UUID.test(id) && (await owns.deck(userId, id)),
    },
  };
}

/**
 * Parses `deck:<uuid>` into its parts, returning null for anything that does
 * not name a declared topic.
 */
export function resolveTopic(
  topics: Record<string, TopicDefinition>,
  raw: unknown,
): { name: string; id: string } | null {
  if (typeof raw !== "string") return null;

  const separator = raw.indexOf(":");
  if (separator <= 0) return null;

  const name = raw.slice(0, separator);
  const id = raw.slice(separator + 1);

  if (!Object.prototype.hasOwnProperty.call(topics, name)) return null;
  if (id.length === 0) return null;

  return { name, id };
}

/**
 * The room for a topic. The same string the client sent, which is why the
 * topic name and its id are joined back the way they were split — a producer
 * that wants to reach a deck's watchers uses `topicRoom("deck", deckId)` rather
 * than writing the string itself, so there is one place it is spelled.
 */
export function topicRoom(name: string, id: string): string {
  return `${name}:${id}`;
}
