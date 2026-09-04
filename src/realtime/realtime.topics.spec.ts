import { describe, expect, it, vi } from "vitest";
import {
  buildTopics,
  resolveTopic,
  topicRoom,
  userRoom,
  type TopicRegistry,
} from "./realtime.topics";

/**
 * A subscription is a read, and the interesting cases are the ones that must be
 * refused. Getting this wrong is not a broken feature — it is one reader's data
 * arriving on another reader's screen, which is why the refusals are tested
 * more thoroughly than the acceptances.
 */

const DECK_A = "11111111-2222-3333-4444-555555555555";

function registry(owns: boolean): TopicRegistry {
  return buildTopics({ deck: vi.fn(() => Promise.resolve(owns)) });
}

describe("resolveTopic", () => {
  const topics = registry(true);

  it("splits a declared topic into its name and id", () => {
    expect(resolveTopic(topics, `deck:${DECK_A}`)).toEqual({
      name: "deck",
      id: DECK_A,
    });
  });

  it("refuses an undeclared topic", () => {
    // Notably `user:` — the room every socket is already in. A client that
    // could name it as a topic would be asking to join someone's private room.
    expect(resolveTopic(topics, "user:someone")).toBeNull();
    expect(resolveTopic(topics, "admin:everything")).toBeNull();
  });

  it("refuses anything malformed", () => {
    expect(resolveTopic(topics, "")).toBeNull();
    expect(resolveTopic(topics, "deck")).toBeNull();
    expect(resolveTopic(topics, ":id")).toBeNull();
    expect(resolveTopic(topics, "deck:")).toBeNull();
    expect(resolveTopic(topics, 42)).toBeNull();
    expect(resolveTopic(topics, null)).toBeNull();
    expect(resolveTopic(topics, { topic: "deck:x" })).toBeNull();
  });

  it("does not treat an inherited property as a topic", () => {
    // `toString` is on Object.prototype; a naive `in` check would find it.
    expect(resolveTopic(topics, "toString:x")).toBeNull();
    expect(resolveTopic(topics, "constructor:x")).toBeNull();
  });

  it("keeps a colon inside the id out of the name", () => {
    // Only the first separator splits, so a malformed id reaches the ownership
    // check rather than becoming a different topic.
    expect(resolveTopic(topics, "deck:a:b")).toEqual({
      name: "deck",
      id: "a:b",
    });
  });
});

describe("deck topic authorization", () => {
  it("allows the owner", async () => {
    await expect(registry(true).deck.canSubscribe("u1", DECK_A)).resolves.toBe(
      true,
    );
  });

  it("refuses someone else's deck", async () => {
    const check = vi.fn(() => Promise.resolve(false));
    const topics = buildTopics({ deck: check });

    await expect(topics.deck.canSubscribe("u1", DECK_A)).resolves.toBe(false);
    // The check is scoped to the reader, so ownership is decided by the query
    // rather than by the caller having passed the right id.
    expect(check).toHaveBeenCalledWith("u1", DECK_A);
  });

  it("never asks the database about a malformed id", async () => {
    const check = vi.fn(() => Promise.resolve(true));
    const topics = buildTopics({ deck: check });

    // A yes from a loose query would be worse than a no, and there is nothing
    // to gain from asking.
    await expect(topics.deck.canSubscribe("u1", "not-a-uuid")).resolves.toBe(
      false,
    );
    await expect(topics.deck.canSubscribe("u1", "../etc")).resolves.toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
});

describe("room names", () => {
  it("names the user room and a topic room the same way", () => {
    expect(userRoom("abc")).toBe("user:abc");
    expect(topicRoom("deck", "abc")).toBe("deck:abc");

    // The hazard, spelled out: a topic called `user` would produce a room name
    // *identical* to the one every socket is already in, so subscribing to
    // `user:<someone>` would join that reader's private room and stream their
    // notifications. Nothing prevents that but the registry, which is why there
    // is a test above asserting `user` resolves to no topic.
    expect(topicRoom("user", "abc")).toBe(userRoom("abc"));
  });
});
