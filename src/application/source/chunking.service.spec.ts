import { ChunkingService } from "./chunking.service";
import { describe, expect, it } from "vitest";

describe("ChunkingService", () => {
  const chunker = new ChunkingService();

  const sentence = (n: number) =>
    `Sentence number ${n} carries a reasonable amount of detail.`;

  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunker.chunk("")).toEqual([]);
    expect(chunker.chunk("   \n\n  \t ")).toEqual([]);
  });

  it("keeps short input as a single chunk", () => {
    const chunks = chunker.chunk("A short note about mitosis.");

    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].text).toBe("A short note about mitosis.");
  });

  it("splits on paragraph boundaries when over the budget", () => {
    const paragraph = Array.from({ length: 12 }, (_, i) =>
      sentence(i + 1),
    ).join(" ");
    const text = [paragraph, paragraph, paragraph].join("\n\n");

    const chunks = chunker.chunk(text, { maxChars: 500, overlapChars: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk must respect the budget (paragraph-level packing cannot
    // exceed it because each paragraph is under it).
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(500);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("hard-splits a single sentence longer than the budget", () => {
    // No sentence terminators at all, so boundary detection has nothing to use.
    const text = "x".repeat(2500);

    const chunks = chunker.chunk(text, { maxChars: 1000, overlapChars: 0 });

    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toHaveLength(1000);
    expect(chunks[1].text).toHaveLength(1000);
    expect(chunks[2].text).toHaveLength(500);
    expect(chunks.map((c) => c.text).join("")).toBe(text);
  });

  it("carries overlap from the previous chunk into the next", () => {
    const paragraph = Array.from({ length: 12 }, (_, i) =>
      sentence(i + 1),
    ).join(" ");
    const text = [paragraph, paragraph].join("\n\n");

    const withOverlap = chunker.chunk(text, {
      maxChars: 500,
      overlapChars: 120,
    });

    expect(withOverlap.length).toBeGreaterThan(1);

    const tail = withOverlap[0].text.slice(-60);
    expect(withOverlap[1].text).toContain(tail.trim());
  });

  it("does not leak overlap into the first chunk", () => {
    const withOverlap = chunker.chunk(`${sentence(1)} ${sentence(2)}`, {
      maxChars: 500,
      overlapChars: 200,
    });

    expect(withOverlap[0].text.startsWith("Sentence number 1")).toBe(true);
  });

  it("normalises CRLF and collapses whitespace runs", () => {
    const chunks = chunker.chunk("Line one.\r\n\r\n\r\n\r\nLine    two.");

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Line one.\n\nLine two.");
  });

  it("never produces an empty chunk", () => {
    const text = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(
      "\n\n",
    );

    for (const c of chunker.chunk(text, { maxChars: 300, overlapChars: 100 })) {
      expect(c.text.trim().length).toBeGreaterThan(0);
    }
  });
});
