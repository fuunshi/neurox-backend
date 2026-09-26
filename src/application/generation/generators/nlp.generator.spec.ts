import type { TextChunk } from "@/application/source/chunking.service";
import type { NeuroxBrainClient } from "@/integrations/neurox-brain/neurox-brain.client";
import type {
  BrainAnalysis,
  BrainCard,
} from "@/integrations/neurox-brain/neurox-brain.types";
import { describe, expect, it, vi } from "vitest";
import { NlpCardGenerator } from "./nlp.generator";

/** Named locals rather than reading mocks off an object — see the note in
 *  `request-id.interceptor.spec.ts`. */
function makeClient(options: {
  enabled?: boolean;
  analyse?: (text: string) => Promise<BrainAnalysis>;
}) {
  const analyse = vi.fn(
    options.analyse ?? (() => Promise.resolve(analysis([]))),
  );
  const isEnabled = vi.fn(() => options.enabled ?? true);

  return {
    client: { analyse, isEnabled } as unknown as NeuroxBrainClient,
    analyse,
    isEnabled,
  };
}

function analysis(cards: Partial<BrainCard>[], elapsedMs = 10): BrainAnalysis {
  return {
    cards: cards.map((card) => ({
      front: card.front ?? "stack",
      back: card.back ?? "A linear data structure.",
      kind: card.kind ?? "DEFINITION",
      confidence: card.confidence ?? 0.8,
      evidence: card.evidence ?? "A stack is a linear data structure.",
    })),
    quiz: [],
    keywords: [],
    summary: [],
    stats: {
      sentences: 3,
      tokens: 20,
      chunks: 2,
      elapsed_ms: elapsedMs,
      model: "en_core_web_md",
    },
  };
}

function chunk(text: string, index = 0): TextChunk {
  return { text, index, start: 0, end: text.length };
}

describe("NlpCardGenerator", () => {
  it("reports availability from configuration, not from reachability", () => {
    // A probe would make provider selection non-deterministic — two identical
    // jobs could run on different generators with nothing recording why.
    const { client, analyse } = makeClient({ enabled: true });

    expect(new NlpCardGenerator(client).isAvailable()).toBe(true);
    expect(analyse).not.toHaveBeenCalled();

    const off = makeClient({ enabled: false });
    expect(new NlpCardGenerator(off.client).isAvailable()).toBe(false);
  });

  it("maps the brain's cards onto the generator contract", async () => {
    const { client } = makeClient({
      analyse: () =>
        Promise.resolve(
          analysis([
            { front: "stack", back: "A LIFO structure.", confidence: 0.9 },
            { front: "queue", back: "A FIFO structure.", confidence: 0.7 },
          ]),
        ),
    });

    const result = await new NlpCardGenerator(client).generate({
      chunks: [chunk("A stack is a LIFO structure.")],
      maxCards: 10,
    });

    // Best first, so a reader working through drafts meets the strongest
    // candidates while they are still paying attention.
    expect(result.cards.map((c) => c.front)).toEqual(["stack", "queue"]);
    expect(result.model).toBe("en_core_web_md");
  });

  it("never puts the source sentence in the hint", async () => {
    // `evidence` contains the answer, so using it as a hint would hand the
    // reader the answer behind a button labelled "hint".
    const { client } = makeClient({
      analyse: () =>
        Promise.resolve(
          analysis([
            {
              front: "stack",
              back: "A LIFO structure.",
              evidence: "A stack is a LIFO structure.",
            },
          ]),
        ),
    });

    const result = await new NlpCardGenerator(client).generate({
      chunks: [chunk("A stack is a LIFO structure.")],
      maxCards: 10,
    });

    expect(result.cards[0].hint).toBeUndefined();
  });

  it("keeps the cards from chunks that worked when one fails", async () => {
    // A PDF page of table rows parses into text with no sentences in it. One
    // bad page must not cost the whole document.
    const { client, analyse } = makeClient({
      analyse: (text) =>
        text.includes("bad")
          ? Promise.reject(new Error("no sentences"))
          : Promise.resolve(analysis([{ front: text.slice(0, 8) }])),
    });

    const result = await new NlpCardGenerator(client).generate({
      chunks: [
        chunk("A stack is a LIFO structure."),
        chunk("bad chunk"),
        chunk("A queue is FIFO."),
      ],
      maxCards: 10,
    });

    expect(analyse).toHaveBeenCalledTimes(3);
    expect(result.cards).toHaveLength(2);
  });

  it("stops asking once the card cap is reached", async () => {
    const { client, analyse } = makeClient({
      analyse: () =>
        Promise.resolve(
          analysis([{ front: "one" }, { front: "two" }, { front: "three" }]),
        ),
    });

    const result = await new NlpCardGenerator(client).generate({
      chunks: [chunk("a"), chunk("b"), chunk("c")],
      maxCards: 2,
    });

    expect(result.cards).toHaveLength(2);
    // One chunk supplied both cards, so the other two were never sent.
    expect(analyse).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when the service answered nothing at all", async () => {
    // Distinct from "the text had no definitions in it": one is a broken
    // deployment and the other is a short document, and they need different
    // responses from whoever reads the job.
    const { client } = makeClient({
      analyse: () => Promise.reject(new Error("connection refused")),
    });

    await expect(
      new NlpCardGenerator(client).generate({
        chunks: [chunk("A stack is a LIFO structure.")],
        maxCards: 10,
      }),
    ).rejects.toThrow(/produced nothing/);
  });
});
