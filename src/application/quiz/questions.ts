import {
  QUIZ_FORMAT,
  type QuizFormat,
} from "@/common/constant/enums/quiz-format.enum";
import { QUIZ_DEFAULTS } from "@/common/constant/quiz.constant";

/**
 * Building a quiz out of cards the reader already has.
 *
 * Everything here is a pure function of the cards, the format and a random
 * source, so the whole of question generation is testable without a database —
 * which matters more than usual, because "is this distractor obviously wrong"
 * is a judgement that needs to be argued rather than observed.
 *
 * ## One shape, three presentations
 *
 * Every format produces the same record: a prompt, the correct answer, and the
 * options it was offered alongside. Multiple choice and matching differ only in
 * how many options a question shares with its neighbours, and cloze differs
 * only in how the prompt is built. Grading, scoring and history are therefore
 * one implementation rather than three that have to agree.
 *
 * ## What is not here
 *
 * Good distractors are a hard problem and this is the cheap version: plausible
 * *length* rather than plausible *meaning*. A real distractor generator would
 * know that "osmosis" and "diffusion" are confusable and that "mitosis" and
 * "photosynthesis" are not, which needs the embeddings work that is not built.
 * The length heuristic gets most of the way for the price of a sort, and the
 * honest limitation is that it cannot tell a near-miss from an unrelated term.
 */

export interface SourceCard {
  id: string;
  front: string;
  back: string;
  hint: string | null;
}

export interface QuizQuestion {
  /** Position in the paper, 0-based. */
  position: number;
  /** The card this was built from, for history and for the results screen. */
  cardId: string;
  prompt: string;
  correct: string;
  /** Every option including the correct one, in the order they are shown. */
  options: string[];
}

export interface BuildOptions {
  /** Upper bound. Fewer cards means fewer questions. */
  count: number;
  /**
   * Injectable so tests are deterministic. Defaults to `Math.random`.
   *
   * Only affects *which* of the candidates are chosen and the option order —
   * never what is correct — so a test can assert on correctness without
   * pretending randomness does not exist.
   */
  random?: () => number;
  optionsPerQuestion?: number;
}

/** Where the cloze blank is drawn. Kept identical to the reader-visible front. */
export const CLOZE_BLANK = "____";

/** A blanked word shorter than this is a fragment, not something to recall. */
const MIN_CLOZE_TERM_CHARS = 5;

/**
 * Words that are never worth blanking, however long they are.
 *
 * Without this the longest-word rule picks "completes" out of "the process by
 * which mitosis completes", producing a question whose answer is a verb chosen
 * for its length. These are the function words and generic nouns that survive
 * the length filter and mean nothing on their own.
 *
 * This is not a stopword list and is not derived from one. It exists to answer
 * one question — could this word be the point of a sentence — and a word being
 * common is not the same as a word being empty.
 */
const NEVER_A_TERM: ReadonlySet<string> = new Set([
  "about",
  "after",
  "again",
  "against",
  "almost",
  "along",
  "amount",
  "another",
  "anything",
  "because",
  "before",
  "being",
  "between",
  "both",
  "cannot",
  "could",
  "different",
  "during",
  "each",
  "either",
  "enough",
  "every",
  "everything",
  "however",
  "itself",
  "kinds",
  "might",
  "more",
  "most",
  "much",
  "must",
  "neither",
  "nothing",
  "number",
  "others",
  "people",
  "places",
  "quite",
  "rather",
  "really",
  "should",
  "similar",
  "since",
  "some",
  "something",
  "sometimes",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "thing",
  "things",
  "those",
  "though",
  "through",
  "times",
  "together",
  "under",
  "until",
  "using",
  "usually",
  "various",
  "ways",
  "were",
  "where",
  "which",
  "while",
  "without",
  "would",
]);

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];

  // Fisher-Yates, so every permutation is equally likely. `sort(() => random()
  // - 0.5)` is the common shortcut and it is not a shuffle — it biases toward
  // leaving the original order in place, which here would mean the correct
  // option kept landing in the same position.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

function countOccurrences(haystack: string, needle: string): number {
  const pattern = new RegExp(
    `\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "gi",
  );

  return haystack.match(pattern)?.length ?? 0;
}

/**
 * The word to remove from a card's answer.
 *
 * The longest word not already in the question, because a blank is only a
 * question if the reader could not have read the answer off the prompt — and
 * because length is the cheapest available proxy for "this is the term the
 * sentence is about" without the extraction work.
 *
 * A word appearing more than once is rejected: two gaps and no way to tell
 * which to fill makes the question unanswerable rather than hard.
 */
export function chooseClozeTerm(
  back: string,
  front: string,
): { word: string; prompt: string } | null {
  const frontLower = front.toLowerCase();
  const candidates = [...back.matchAll(/[A-Za-z][A-Za-z'-]+/g)].filter(
    (match) => {
      const word = match[0];

      if (word.length < MIN_CLOZE_TERM_CHARS) return false;
      if (NEVER_A_TERM.has(word.toLowerCase())) return false;
      if (frontLower.includes(word.toLowerCase())) return false;
      if (countOccurrences(back, word) !== 1) return false;

      return true;
    },
  );

  if (candidates.length === 0) return null;

  const longest = candidates.reduce((best, next) =>
    next[0].length > best[0].length ? next : best,
  );

  const pattern = new RegExp(
    `\\b${longest[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  );

  return { word: longest[0], prompt: back.replace(pattern, CLOZE_BLANK) };
}

/**
 * A distinctive-looking word from an answer, for use as a cloze distractor.
 *
 * Deliberately the same rule as `chooseClozeTerm` — the longest word — so that
 * a wrong option is the same *kind* of thing as the right one. Offering a whole
 * sentence against a single word would make the answer obvious without any
 * knowledge of the subject.
 */
function poolWord(back: string): string | null {
  const words = [...back.matchAll(/[A-Za-z][A-Za-z'-]+/g)]
    .map((match) => match[0])
    .filter(
      (word) =>
        word.length >= MIN_CLOZE_TERM_CHARS &&
        !NEVER_A_TERM.has(word.toLowerCase()),
    );

  if (words.length === 0) return null;

  return words.reduce((best, next) =>
    next.length > best.length ? next : best,
  );
}

/**
 * Picks options that are wrong but not obviously so.
 *
 * The pool is every other card in the deck, which already makes the distractors
 * topically appropriate — they come from the same material. What this adds is
 * *shape*: options close in length to the right answer read as plausible
 * alternatives, where a three-letter answer among long sentences is eliminated
 * on sight without knowing anything.
 *
 * The nearest by length are taken outright, not sampled from a window. That is
 * a deliberate trade of variety for plausibility: sampling would let a
 * three-letter answer onto a question whose real answer is a long phrase, which
 * is the exact failure this is here to prevent, and it would do so precisely
 * when the pool is small enough that the reader has fewer options to hide among.
 *
 * Variety is kept where it is free: the pool is shuffled before the length
 * sort, and the sort is stable, so options of equal closeness rotate between
 * runs without any less-plausible one ever being promoted over a better fit.
 */
export function pickDistractors(
  correct: string,
  pool: string[],
  count: number,
  random: () => number,
): string[] {
  const seen = new Set([correct.trim().toLowerCase()]);

  const candidates = pool.filter((option) => {
    const key = option.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  if (candidates.length === 0) return [];

  return shuffled(candidates, random)
    .sort(
      (a, b) =>
        Math.abs(a.length - correct.length) -
        Math.abs(b.length - correct.length),
    )
    .slice(0, count);
}

function multipleChoice(
  card: SourceCard,
  pool: string[],
  random: () => number,
  optionsPerQuestion: number,
): QuizQuestion | null {
  const correct = card.back.trim();
  if (correct.length === 0 || card.front.trim().length === 0) return null;

  const distractors = pickDistractors(
    correct,
    pool,
    optionsPerQuestion - 1,
    random,
  );

  // A question with no wrong answers is not a question. Better to set fewer
  // than to ask something unanswerable.
  if (distractors.length === 0) return null;

  return {
    position: 0,
    cardId: card.id,
    prompt: card.front.trim(),
    correct,
    options: shuffled([correct, ...distractors], random),
  };
}

function cloze(
  card: SourceCard,
  pool: string[],
  random: () => number,
  optionsPerQuestion: number,
): QuizQuestion | null {
  const blanked = chooseClozeTerm(card.back, card.front);
  if (!blanked) return null;

  const distractors = pickDistractors(
    blanked.word,
    pool,
    optionsPerQuestion - 1,
    random,
  );

  if (distractors.length === 0) return null;

  return {
    position: 0,
    cardId: card.id,
    prompt: blanked.prompt,
    correct: blanked.word,
    options: shuffled([blanked.word, ...distractors], random),
  };
}

/**
 * Matching answers its own question differently: every prompt shares one pool
 * of answers, which is what makes it a board to pair up rather than several
 * multiple-choice questions stacked.
 *
 * Distractors are therefore not chosen per question. Every answer in the set is
 * an option for every prompt, and the wrongness comes from the pairing.
 */
function matching(cards: SourceCard[], random: () => number): QuizQuestion[] {
  const usable = cards.filter(
    (card) => card.front.trim().length > 0 && card.back.trim().length > 0,
  );

  // Fewer than two pairs is not something to match.
  if (usable.length < 2) return [];

  // Deduplicate answers: two cards with the same answer would make one of them
  // unanswerable, because the reader cannot tell which is wanted.
  const seen = new Set<string>();
  const pairs = usable.filter((card) => {
    const key = card.back.trim().toLowerCase();
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  if (pairs.length < 2) return [];

  const answers = shuffled(
    pairs.map((card) => card.back.trim()),
    random,
  );

  return pairs.map((card) => ({
    position: 0,
    cardId: card.id,
    prompt: card.front.trim(),
    correct: card.back.trim(),
    options: answers,
  }));
}

/**
 * Builds a quiz from a deck's cards.
 *
 * Cards are shuffled before selection so that a deck's first few cards are not
 * the only ones ever asked about — without it, every quiz on a large deck would
 * test the same opening material and the rest would go unexamined.
 */
export function buildQuestions(
  cards: SourceCard[],
  format: QuizFormat,
  options: BuildOptions,
): QuizQuestion[] {
  const random = options.random ?? Math.random;
  const optionsPerQuestion =
    options.optionsPerQuestion ?? QUIZ_DEFAULTS.OPTIONS_PER_QUESTION;

  const usable = cards.filter(
    (card) => card.front.trim().length > 0 && card.back.trim().length > 0,
  );

  const chosen = shuffled(usable, random).slice(
    0,
    Math.max(0, Math.min(options.count, usable.length)),
  );

  if (format === QUIZ_FORMAT.MATCHING) {
    return matching(chosen, random).map((question, index) => ({
      ...question,
      position: index,
    }));
  }

  // The pool is the whole deck, not just the cards being asked about. Drawing
  // it from the questions would mean a three-question quiz can only ever offer
  // three options, however deep the deck — the reader would be choosing between
  // the answers to the other questions on the paper, which is both a smaller
  // choice and a hint about what is coming.
  const pool =
    format === QUIZ_FORMAT.CLOZE
      ? usable
          .map((card) => poolWord(card.back))
          .filter((word): word is string => word !== null)
      : usable.map((card) => card.back.trim());

  const build = format === QUIZ_FORMAT.CLOZE ? cloze : multipleChoice;

  const questions: QuizQuestion[] = [];

  for (const card of chosen) {
    const question = build(card, pool, random, optionsPerQuestion);
    if (!question) continue;

    questions.push({ ...question, position: questions.length });
  }

  return questions;
}

/**
 * Grades one answer.
 *
 * Case- and whitespace-insensitive, because both sides come from the same
 * stored string but may have been through a form and back. Never partial: an
 * option either is the answer or is not.
 */
export function isCorrect(chosen: string | null, correct: string): boolean {
  if (chosen === null) return false;

  return chosen.trim().toLowerCase() === correct.trim().toLowerCase();
}
