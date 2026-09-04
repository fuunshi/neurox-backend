import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  isNotificationType,
  renderNotification,
} from "./notification.templates";

/**
 * Templates are the only thing between a stored row and what a reader sees, and
 * the rows outlive the code that wrote them. So the tests that matter are the
 * unglamorous ones: a row written by an older version, with a field missing or
 * of the wrong type, must still render something rather than break the list it
 * appears in.
 */

describe("renderNotification", () => {
  it("names the deck and counts the cards", () => {
    const rendered = renderNotification("CARDS_GENERATED", {
      deckId: "deck-1",
      deckTitle: "Cardiac physiology",
      count: 12,
      sourceTitle: "Lecture 3",
    });

    expect(rendered).toMatchObject({
      title: "12 draft cards ready",
      href: "/decks/deck-1",
      tone: "due",
    });
    expect(rendered?.body).toContain("Cardiac physiology");
    expect(rendered?.body).toContain("Lecture 3");
  });

  it("says a single card in the singular", () => {
    const rendered = renderNotification("CARDS_GENERATED", {
      deckId: "d",
      deckTitle: "Deck",
      count: 1,
      sourceTitle: null,
    });

    expect(rendered?.title).toBe("1 draft card ready");
    expect(rendered?.body).toContain("It is waiting");
  });

  it("reads a run that found nothing as a fact, not a failure", () => {
    const rendered = renderNotification("CARDS_GENERATED", {
      deckId: "d",
      deckTitle: "Deck",
      count: 0,
      sourceTitle: null,
    });

    expect(rendered?.title).toMatch(/nothing to draft/i);
    // Not amber: nothing is waiting to be reviewed.
    expect(rendered?.tone).toBe("neutral");
  });

  it("returns null for a template this build does not know", () => {
    // A row written before a template was renamed. Skipped, not thrown — one
    // stale row must not take the whole list down.
    expect(renderNotification("SOMETHING_REMOVED", {})).toBeNull();
  });

  describe("a row written by an older version", () => {
    it("survives every field being absent", () => {
      const rendered = renderNotification("CARDS_GENERATED", {});

      expect(rendered).not.toBeNull();
      expect(rendered?.href).toBeNull();
      expect(rendered?.title).toMatch(/nothing to draft/i);
    });

    it("survives the fields being the wrong type", () => {
      const rendered = renderNotification("CARDS_GENERATED", {
        deckId: 42,
        deckTitle: { nested: true },
        count: "many",
        sourceTitle: ["a"],
      });

      expect(rendered).not.toBeNull();
      expect(rendered?.href).toBeNull();
      expect(rendered?.title).toMatch(/nothing to draft/i);
    });

    it("survives params not being an object at all", () => {
      expect(renderNotification("EMAIL_VERIFIED", "not-json")).not.toBeNull();
      expect(renderNotification("EMAIL_VERIFIED", null)).not.toBeNull();
    });

    it("ignores a negative or fractional count rather than printing it", () => {
      expect(
        renderNotification("CARDS_IMPORTED", { count: -3, deckTitle: "D" })
          ?.title,
      ).toBe("0 cards imported");
    });
  });

  it("promises a way out of a password change that was not yours", () => {
    const rendered = renderNotification("PASSWORD_CHANGED", {
      at: "2026-01-01T00:00:00.000Z",
    });

    expect(rendered?.tone).toBe("due");
    expect(rendered?.href).toBe("/auth/forgot-password");
  });

  it("covers every declared type", () => {
    // Guards against a type being added to the union and forgotten here, which
    // would ship a producer whose notifications never render.
    for (const type of NOTIFICATION_TYPES) {
      expect(isNotificationType(type)).toBe(true);
      expect(renderNotification(type, {})).not.toBeNull();
    }
  });
});
