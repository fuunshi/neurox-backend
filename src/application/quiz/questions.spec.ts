import { QUIZ_FORMAT } from "@/common/constant/enums/quiz-format.enum";
import {
  buildQuestions,
  chooseClozeTerm,
  isCorrect,
  pickDistractors,
  type SourceCard,
} from "./questions";
import { describe, expect, it } from "vitest";

/** A deterministic stand-in for `Math.random`, so the tests are repeatable. */
function seeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const card = (over: Partial<SourceCard> = {}): SourceCard => ({
  id: over.id ?? `card-${over.front ?? "x"}`,
  front: "What is mitosis?",
  back: "The process by which a single cell divides into two identical cells.",
  hint: null,
  ...over,
});

const deck: SourceCard[] = [
  card({
    id: "1",
    front: "What is mitosis?",
    back: "The process by which a single cell divides into two.",
  }),
  card({
    id: "2",
    front: "What is osmosis?",
    back: "The movement of water across a semi-permeable membrane.",
  }),
  card({
    id: "3",
    front: "What is diffusion?",
    back: "The movement of particles from high to low concentration.",
  }),
  card({
    id: "4",
    front: "What is a ribosome?",
    back: "The structure that assembles proteins from amino acids.",
  }),
  card({
    id: "5",
    front: "What is ATP?",
    back: "The molecule that carries energy within a cell.",
  }),
];

describe("chooseClozeTerm", () => {
  it("blanks the longest word and keeps the rest of the answer", () => {
    const blanked = chooseClozeTerm("The process of cellular respiration.", "");

    expect(blanked?.word).toBe("respiration");
    expect(blanked?.prompt).toBe("The process of cellular ____.");
  });

  it("does not blank a word the question already contains", () => {
    // Otherwise the answer is sitting in the prompt. "mitosis" is excluded, so
    // the next-best candidate is blanked instead.
    const blanked = chooseClozeTerm(
      "The process by which mitosis completes.",
      "What is mitosis?",
    );

    expect(blanked?.word).toBe("completes");
  });

  it("returns null when the only candidate is in the question", () => {
    expect(chooseClozeTerm("Mitosis.", "What is mitosis?")).toBeNull();
  });

  it("refuses a word that appears twice, which would be two gaps", () => {
    const blanked = chooseClozeTerm(
      "Mitosis copies, then mitosis divides.",
      "",
    );

    expect(blanked?.word).not.toBe("Mitosis");
  });

  it("returns null when there is nothing worth blanking", () => {
    expect(chooseClozeTerm("It is a thing.", "")).toBeNull();
    expect(chooseClozeTerm("", "")).toBeNull();
  });
});

describe("pickDistractors", () => {
  it("never returns the correct answer", () => {
    const options = pickDistractors(
      "mitosis",
      ["mitosis", "osmosis", "diffusion"],
      3,
      seeded(),
    );

    expect(options.map((o) => o.toLowerCase())).not.toContain("mitosis");
  });

  it("never returns the same option twice", () => {
    const options = pickDistractors(
      "alpha",
      ["beta", "beta", "gamma"],
      3,
      seeded(),
    );

    expect(new Set(options).size).toBe(options.length);
  });

  it("prefers options of a similar length to the answer", () => {
    // The cheap version of plausibility: a three-letter answer among long
    // sentences is eliminated on sight without knowing anything.
    const options = pickDistractors(
      "photosynthesis",
      ["glycolysis", "respiration", "ATP", "pH"],
      2,
      seeded(),
    );

    expect(options).toHaveLength(2);
    expect(options).not.toContain("ATP");
    expect(options).not.toContain("pH");
  });

  it("returns fewer options rather than failing when the pool is small", () => {
    expect(pickDistractors("alpha", ["beta"], 3, seeded())).toEqual(["beta"]);
    expect(pickDistractors("alpha", [], 3, seeded())).toEqual([]);
  });
});

describe("buildQuestions — multiple choice", () => {
  const build = (count = 5) =>
    buildQuestions(deck, QUIZ_FORMAT.MULTIPLE_CHOICE, {
      count,
      random: seeded(),
    });

  it("asks the requested number of questions", () => {
    expect(build(3)).toHaveLength(3);
  });

  it("never asks more questions than there are cards", () => {
    expect(build(99).length).toBeLessThanOrEqual(deck.length);
  });

  it("offers the correct answer among the options, exactly once", () => {
    for (const question of build()) {
      const matches = question.options.filter(
        (option) => option.toLowerCase() === question.correct.toLowerCase(),
      );

      expect(matches).toHaveLength(1);
    }
  });

  it("offers up to four options when the deck can supply them", () => {
    for (const question of build()) {
      expect(question.options).toHaveLength(4);
    }
  });

  it("draws distractors from the whole deck, not just the questions asked", () => {
    // The bug this guards: a three-question quiz on a twenty-card deck offered
    // only three options, because the pool was the selected questions rather
    // than everything available. That is both a smaller choice and a hint about
    // what the other questions will ask.
    const questions = buildQuestions(deck, QUIZ_FORMAT.MULTIPLE_CHOICE, {
      count: 3,
      random: seeded(),
    });

    expect(questions).toHaveLength(3);
    for (const question of questions) {
      expect(question.options).toHaveLength(4);
    }
  });

  it("never offers a duplicate option within one question", () => {
    for (const question of build()) {
      expect(new Set(question.options).size).toBe(question.options.length);
    }
  });

  it("maps every question back to the card it came from", () => {
    for (const question of build()) {
      expect(deck.map((c) => c.id)).toContain(question.cardId);
    }
  });

  it("numbers the questions in order", () => {
    expect(build().map((q) => q.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("is reproducible for a given random source", () => {
    // Questions are stored on the attempt, so grading never depends on this —
    // but a generator that cannot be reproduced cannot be tested.
    const a = buildQuestions(deck, QUIZ_FORMAT.MULTIPLE_CHOICE, {
      count: 5,
      random: seeded(7),
    });
    const b = buildQuestions(deck, QUIZ_FORMAT.MULTIPLE_CHOICE, {
      count: 5,
      random: seeded(7),
    });

    expect(a).toEqual(b);
  });
});

describe("buildQuestions — cloze", () => {
  it("blanks a term out of the answer and asks for it back", () => {
    const questions = buildQuestions(deck, QUIZ_FORMAT.CLOZE, {
      count: 5,
      random: seeded(),
    });

    expect(questions.length).toBeGreaterThan(0);

    for (const question of questions) {
      expect(question.prompt).toContain("____");
      expect(question.prompt).not.toContain(question.correct);
      expect(question.options).toContain(question.correct);
    }
  });

  it("offers word-shaped distractors, not whole answers", () => {
    // A whole sentence offered against a single word gives the answer away.
    for (const question of buildQuestions(deck, QUIZ_FORMAT.CLOZE, {
      count: 5,
      random: seeded(),
    })) {
      for (const option of question.options) {
        expect(option.split(" ").length).toBeLessThan(3);
      }
    }
  });
});

describe("buildQuestions — matching", () => {
  const build = () =>
    buildQuestions(deck, QUIZ_FORMAT.MATCHING, { count: 5, random: seeded() });

  it("gives every question the same pool of answers", () => {
    const questions = build();

    expect(questions.length).toBeGreaterThan(1);

    const first = [...questions[0].options].sort();
    for (const question of questions) {
      expect([...question.options].sort()).toEqual(first);
    }
  });

  it("makes every prompt's answer present in the shared pool", () => {
    for (const question of build()) {
      expect(question.options).toContain(question.correct);
    }
  });

  it("drops a duplicate answer, which would be unanswerable", () => {
    const duplicated = [
      card({ id: "a", front: "First", back: "Same answer here." }),
      card({ id: "b", front: "Second", back: "Same answer here." }),
      card({ id: "c", front: "Third", back: "A different answer." }),
    ];

    const questions = buildQuestions(duplicated, QUIZ_FORMAT.MATCHING, {
      count: 5,
      random: seeded(),
    });

    expect(questions).toHaveLength(2);
  });

  it("produces nothing when there is not enough to pair", () => {
    expect(
      buildQuestions([deck[0]], QUIZ_FORMAT.MATCHING, {
        count: 5,
        random: seeded(),
      }),
    ).toEqual([]);
  });
});

describe("buildQuestions — general", () => {
  it("produces nothing for an empty deck", () => {
    for (const format of Object.values(QUIZ_FORMAT)) {
      expect(
        buildQuestions([], format, { count: 10, random: seeded() }),
      ).toEqual([]);
    }
  });

  it("skips cards that are missing a side", () => {
    const incomplete = [
      card({ id: "a", front: "Has both", back: "A perfectly good answer." }),
      card({ id: "b", front: "   ", back: "An answer without a question." }),
      card({ id: "c", front: "A question without an answer", back: "" }),
      card({ id: "d", front: "Also complete", back: "Another good answer." }),
    ];

    const questions = buildQuestions(incomplete, QUIZ_FORMAT.MULTIPLE_CHOICE, {
      count: 10,
      random: seeded(),
    });

    expect(questions.map((q) => q.cardId).sort()).toEqual(["a", "d"]);
  });
});

describe("isCorrect", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(isCorrect("  Mitosis ", "mitosis")).toBe(true);
  });

  it("is never partial", () => {
    expect(isCorrect("mitosi", "mitosis")).toBe(false);
  });

  it("treats a skipped question as wrong", () => {
    expect(isCorrect(null, "mitosis")).toBe(false);
  });
});
