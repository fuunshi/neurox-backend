import { describe, expect, it } from "vitest";
import {
  buildPage,
  decodeCursor,
  encodeCursor,
  keysetAfter,
} from "./cursor.util";

const AT = new Date("2026-09-01T10:00:00.000Z");

function row(id: string, createdAt: Date = AT) {
  return { id, createdAt };
}

describe("decodeCursor", () => {
  it("round-trips what encodeCursor produced", () => {
    const payload = { id: "abc", createdAt: AT.toISOString() };

    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("treats an absent cursor as no cursor", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null rather than throwing on a malformed cursor", () => {
    // The contract is that a cursor the client mangled starts from the first
    // page. A Base64 error surfaced to a reader would be a worse outcome, so
    // each of these has to be survivable rather than merely unlikely.
    expect(decodeCursor("not base64 at all!!")).toBeNull();
    expect(
      decodeCursor(Buffer.from("{ not json").toString("base64")),
    ).toBeNull();
  });

  it("rejects well-formed JSON that is not a cursor", () => {
    const encoded = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64");

    expect(decodeCursor(encoded(null))).toBeNull();
    expect(decodeCursor(encoded("string"))).toBeNull();
    expect(decodeCursor(encoded({}))).toBeNull();
    // Half a cursor is not a cursor: both halves are the ordering key.
    expect(decodeCursor(encoded({ id: "abc" }))).toBeNull();
    expect(decodeCursor(encoded({ createdAt: AT.toISOString() }))).toBeNull();
    expect(
      decodeCursor(encoded({ id: 1, createdAt: AT.toISOString() })),
    ).toBeNull();
  });
});

describe("keysetAfter", () => {
  it("adds no predicate for the first page", () => {
    expect(keysetAfter(null)).toEqual({});
  });

  it("resumes strictly after the cursor row, with the id tiebreak", () => {
    const clause = keysetAfter({ id: "abc", createdAt: AT.toISOString() });

    expect(clause).toEqual({
      $or: [{ createdAt: { $lt: AT } }, { createdAt: AT, id: { $lt: "abc" } }],
    });
  });

  it("compares createdAt as a Date, not the string it arrived as", () => {
    // A string here would still be a valid filter to MikroORM and would order
    // correctly by luck; the tiebreak clause is where it stops being luck.
    const clause = keysetAfter({ id: "abc", createdAt: AT.toISOString() });

    expect(clause.$or?.[0]).toEqual({ createdAt: { $lt: AT } });
    expect(
      (clause.$or?.[0] as { createdAt: { $lt: unknown } }).createdAt.$lt,
    ).toBeInstanceOf(Date);
  });
});

describe("buildPage", () => {
  it("closes the page when there is nothing more to fetch", () => {
    const page = buildPage([row("a"), row("b")], 5);

    expect(page.data.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(page.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      limit: 5,
    });
  });

  it("drops the look-ahead row and pages from the last kept one", () => {
    // The caller fetches `limit + 1`; the extra row exists only to answer
    // `hasMore` and must never be returned as data.
    const page = buildPage([row("a"), row("b"), row("c")], 2);

    expect(page.data.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(page.pagination.hasMore).toBe(true);
    expect(decodeCursor(page.pagination.nextCursor ?? undefined)).toEqual({
      id: "b",
      createdAt: AT.toISOString(),
    });
  });

  it("handles an empty result without inventing a cursor", () => {
    const page = buildPage([], 5);

    expect(page.data).toEqual([]);
    expect(page.pagination.nextCursor).toBeNull();
    expect(page.pagination.hasMore).toBe(false);
  });

  it("consumes its own cursor", () => {
    // The property that makes the whole scheme work: the cursor one page emits
    // is the one the next page resumes from, carrying the ordering key.
    const first = buildPage([row("a", AT), row("b", AT), row("c", AT)], 2);
    const cursor = decodeCursor(first.pagination.nextCursor ?? undefined);

    expect(keysetAfter(cursor)).toEqual({
      $or: [{ createdAt: { $lt: AT } }, { createdAt: AT, id: { $lt: "b" } }],
    });
  });
});
