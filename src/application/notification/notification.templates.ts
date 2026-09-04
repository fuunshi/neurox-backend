/**
 * What a notification says, as opposed to what happened.
 *
 * The database stores a **type and its parameters** — `CARDS_GENERATED` and
 * `{ deckId, deckTitle, count }` — and never the sentence. The title, the body
 * and the link are produced here, at the moment the row is read or pushed.
 *
 * That is the whole reason for the indirection. Storing "12 cards are ready"
 * freezes the wording of every notification ever sent: rewording the message
 * reaches only future ones, and a reader who switches language keeps their old
 * notifications in the old one. Storing the facts means a reworded template
 * rewords the history, and the row stays a small, inspectable record of *what
 * happened* rather than a copy of how it was once described.
 *
 * It also means a notification cannot carry arbitrary text into the UI. A row
 * can only name a template this file defines, so the worst a bad row can do is
 * render badly — it cannot inject content.
 */

/** The tones the UI already uses for chips. Reusing them keeps a notification
 *  legible in all three themes without inventing a palette. */
export type NotificationTone =
  | "neutral"
  | "accent"
  | "due"
  | "success"
  | "danger";

export interface RenderedNotification {
  title: string;
  body: string;
  /** Where it goes when clicked. Null when there is nowhere useful to send the
   *  reader — a fact worth knowing rather than a place to be. */
  href: string | null;
  tone: NotificationTone;
}

/**
 * The parameters each template needs, as a discriminated union.
 *
 * Producers are typed against this, so passing the wrong shape is a compile
 * error at the call site rather than a row that renders as blanks. The stored
 * row is deliberately *not* typed this way — it is JSON that may have been
 * written by an older version, and `render` below treats it as such.
 */
export type NotificationDraft =
  | {
      type: "CARDS_GENERATED";
      params: {
        deckId: string;
        deckTitle: string;
        count: number;
        sourceTitle: string | null;
      };
    }
  | {
      type: "CARDS_IMPORTED";
      params: { deckId: string; deckTitle: string; count: number };
    }
  | {
      type: "PASSWORD_CHANGED";
      params: { at: string };
    }
  | {
      type: "EMAIL_VERIFIED";
      params: { email: string };
    };

export type NotificationType = NotificationDraft["type"];

type Params = Record<string, unknown>;

/**
 * Readers below are defensive on purpose.
 *
 * A stored row is JSON written by whatever version was deployed at the time, so
 * a field can be absent, or the wrong type, or the template can have been
 * renamed since. Throwing here would mean one bad row breaks the whole list —
 * including the unread count, which is on every page. Falling back to a vaguer
 * sentence loses a detail; throwing loses the feature.
 */
function readString(params: Params, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readCount(params: Params, key: string): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

const TEMPLATES = {
  CARDS_GENERATED: (params: Params): RenderedNotification => {
    const count = readCount(params, "count");
    const deckTitle = readString(params, "deckTitle", "a deck");
    const sourceTitle = readString(params, "sourceTitle", "");
    const deckId = readString(params, "deckId", "");

    return {
      title:
        count === 0
          ? "Nothing to draft from that source"
          : `${count} draft ${plural(count, "card", "cards")} ready`,
      body:
        count === 0
          ? `The run over ${deckTitle} read its source but found nothing to ask about.`
          : `${plural(count, "It is", "They are")} waiting in ${deckTitle} for you to keep or discard${
              sourceTitle ? `, drafted from ${sourceTitle}` : ""
            }.`,
      href: deckId ? `/decks/${deckId}` : null,
      // Amber: a draft is something awaiting attention, the same meaning the
      // colour carries everywhere else in the product.
      tone: count === 0 ? "neutral" : "due",
    };
  },

  CARDS_IMPORTED: (params) => {
    const count = readCount(params, "count");
    const deckTitle = readString(params, "deckTitle", "a deck");
    const deckId = readString(params, "deckId", "");

    return {
      title: `${count} ${plural(count, "card", "cards")} imported`,
      body: `Added to ${deckTitle} as drafts, so nothing reaches study until you have looked at it.`,
      href: deckId ? `/decks/${deckId}` : null,
      tone: "due",
    };
  },

  PASSWORD_CHANGED: (params) => {
    const at = readString(params, "at", "");

    return {
      title: "Your password was changed",
      body: at
        ? `Changed on ${new Date(at).toUTCString()}. Every device was signed out. If this was not you, reset it now.`
        : "Every device was signed out. If this was not you, reset your password now.",
      href: "/auth/forgot-password",
      // Amber rather than neutral: a security event the reader did not cause
      // is exactly the thing worth looking at twice.
      tone: "due",
    };
  },

  EMAIL_VERIFIED: (params) => {
    const email = readString(params, "email", "your address");

    return {
      title: "Address confirmed",
      body: `${email} is confirmed, which is what the reminder emails were asking for.`,
      href: "/settings",
      tone: "success",
    };
  },
} satisfies Record<NotificationType, (params: Params) => RenderedNotification>;

/**
 * Every template key, derived from the table above.
 *
 * Derived rather than listed a second time so the two cannot drift, and the
 * `satisfies` above is what makes the list exhaustive: adding a member to
 * `NotificationType` without writing its template is a compile error, because
 * the object no longer satisfies the record.
 */
export const NOTIFICATION_TYPES = Object.keys(TEMPLATES) as NotificationType[];

/** True when `type` names a template this build knows.
 *
 *  Compared against the list rather than by probing the object, which would
 *  need `hasOwnProperty.call` — `any`-returning in this project's
 *  configuration, and so unusable in a type predicate. */
export function isNotificationType(type: string): type is NotificationType {
  return NOTIFICATION_TYPES.some((known) => known === type);
}

/**
 * Renders a stored row.
 *
 * Returns null for an unknown type rather than throwing, so a template renamed
 * in a later version leaves its old rows skipped instead of breaking the list.
 */
export function renderNotification(
  type: string,
  params: unknown,
): RenderedNotification | null {
  if (!isNotificationType(type)) return null;

  const safe: Params =
    typeof params === "object" && params !== null ? (params as Params) : {};

  return TEMPLATES[type](safe);
}
