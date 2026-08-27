/**
 * What the demo account is made of.
 *
 * Kept as plain data rather than inline in the seeder so the content can be
 * read and edited as content — a deck whose cards are wrong is a copy problem,
 * not a seeding bug, and the two are easier to tell apart when they are not
 * interleaved.
 *
 * The material is deliberately varied across subjects. A demo in one domain
 * makes every screen look the same, and the parts of this app worth showing —
 * a struggling deck versus a settled one, sources that produced cards versus
 * sources that did not — need more than one shape of data to be visible.
 */

export interface DemoCard {
  front: string;
  back: string;
  hint?: string;
}

export interface DemoDeck {
  title: string;
  description: string;
  /**
   * How well the reader knows this deck, 0–1.
   *
   * Drives the simulated review history: a high performer graduates quickly and
   * is rarely failed, a low one keeps lapsing. This is what makes one deck read
   * as settled and another as a struggle, which is the thing the progress
   * screens exist to show.
   */
  strength: number;
  /** Roughly how many days back this deck's history starts. */
  studyDays: number;
  cards: DemoCard[];
}

export interface DemoSource {
  title: string;
  text: string;
  /** Deck this source was generated into, by title. */
  feeds: string;
  /** 0–1 of the deck's cards that came from this source. */
  share: number;
}

export const DEMO_DECKS: DemoDeck[] = [
  {
    title: "Cell biology",
    description: "The basics of what cells are and how they divide.",
    strength: 0.75,
    studyDays: 52,
    cards: [
      {
        front: "What is mitosis?",
        back: "The process by which a single cell divides into two genetically identical cells.",
      },
      {
        front: "What is meiosis?",
        back: "The process of cell division that produces four gametes, each with half the chromosome number.",
      },
      {
        front: "What is the cell membrane?",
        back: "The selectively permeable barrier that controls what enters and leaves a cell.",
      },
      {
        front: "What is the function of a ribosome?",
        back: "Assembling proteins by translating messenger RNA into amino acid chains.",
      },
      {
        front: "What is diffusion?",
        back: "The movement of particles from an area of high concentration to an area of low concentration.",
      },
      {
        front: "What is osmosis?",
        back: "The movement of water across a semi-permeable membrane toward the more concentrated solution.",
      },
      {
        front: "What is ATP?",
        back: "The molecule that carries usable energy within a cell, released when its phosphate bond breaks.",
      },
      {
        front: "What is the mitochondrion?",
        back: "The organelle that generates most of the chemical energy a cell needs to function.",
        hint: "Think about where respiration happens.",
      },
      {
        front: "What is a chromosome?",
        back: "A thread-like structure of DNA and protein that carries genetic information.",
      },
      {
        front: "What is apoptosis?",
        back: "Programmed cell death, by which the body removes cells it no longer needs.",
      },
    ],
  },
  {
    title: "Spanish verbs",
    description: "The irregular ones, which are most of the useful ones.",
    strength: 0.55,
    studyDays: 44,
    cards: [
      {
        front: "to be (permanent)",
        back: "ser",
        hint: "Identity, origin, profession.",
      },
      {
        front: "to be (temporary)",
        back: "estar",
        hint: "Location, mood, condition.",
      },
      { front: "to go", back: "ir" },
      { front: "to have", back: "tener", hint: "Also used for age." },
      { front: "to do / to make", back: "hacer" },
      { front: "to be able to", back: "poder", hint: "Stem changes o → ue." },
      { front: "to want", back: "querer", hint: "Stem changes e → ie." },
      { front: "to say / to tell", back: "decir" },
      { front: "to come", back: "venir" },
      { front: "to know (a fact)", back: "saber" },
      { front: "to know (a person or place)", back: "conocer" },
      { front: "to give", back: "dar" },
    ],
  },
  {
    title: "Cognitive biases",
    description: "The ways judgement goes wrong by default.",
    strength: 0.4,
    studyDays: 31,
    cards: [
      {
        front: "What is confirmation bias?",
        back: "Seeking out and weighting evidence that supports what you already believe.",
      },
      {
        front: "What is the availability heuristic?",
        back: "Judging how likely something is by how easily examples come to mind.",
      },
      {
        front: "What is the sunk cost fallacy?",
        back: "Continuing with something because of what it has already cost, rather than what it will return.",
      },
      {
        front: "What is anchoring?",
        back: "Letting the first number you hear pull every later estimate toward it.",
      },
      {
        front: "What is the Dunning-Kruger effect?",
        back: "The least skilled being the most confident, because the skill needed to judge is the skill they lack.",
      },
      {
        front: "What is survivorship bias?",
        back: "Drawing conclusions from the cases that survived, having lost sight of the ones that did not.",
      },
      {
        front: "What is the halo effect?",
        back: "Letting one good trait colour your judgement of everything else about a person.",
      },
      {
        front: "What is loss aversion?",
        back: "Feeling a loss roughly twice as strongly as an equivalent gain.",
      },
      {
        front: "What is the planning fallacy?",
        back: "Underestimating how long a task will take, even when similar tasks have overrun before.",
      },
    ],
  },
  {
    title: "Database normalisation",
    description: "Getting tables to stop repeating themselves.",
    strength: 0.85,
    studyDays: 60,
    cards: [
      {
        front: "What is first normal form?",
        back: "Every column holds a single atomic value and every row is unique.",
      },
      {
        front: "What is second normal form?",
        back: "In 1NF, with no non-key column depending on only part of a composite key.",
      },
      {
        front: "What is third normal form?",
        back: "In 2NF, with no non-key column depending on another non-key column.",
      },
      {
        front: "What is a functional dependency?",
        back: "A relationship where knowing one attribute's value determines another's.",
      },
      {
        front: "What is a candidate key?",
        back: "Any minimal set of columns that uniquely identifies a row.",
      },
      {
        front: "When is denormalisation worth it?",
        back: "When read performance matters more than write integrity, and the duplication is maintained deliberately.",
      },
      {
        front: "What is a transitive dependency?",
        back: "A non-key column determined by another non-key column rather than by the key.",
      },
      {
        front: "What problem does normalisation solve?",
        back: "Update, insert and delete anomalies caused by storing the same fact in more than one place.",
      },
    ],
  },
  {
    title: "Music theory basics",
    description: "Enough to read a score and know why it sounds that way.",
    strength: 0.65,
    studyDays: 24,
    cards: [
      {
        front: "How many semitones are in an octave?",
        back: "Twelve, which is why there are twelve distinct pitch classes.",
      },
      {
        front: "What is a major third?",
        back: "Four semitones, the interval that gives a major chord its brightness.",
      },
      {
        front: "What is a minor third?",
        back: "Three semitones, one fewer than the major third.",
      },
      {
        front: "What is a perfect fifth?",
        back: "Seven semitones, the most stable interval after the octave.",
      },
      {
        front: "What is the tonic?",
        back: "The first degree of a scale, and the note the key is named after.",
      },
      {
        front: "What is a time signature?",
        back: "Two numbers: how many beats in a bar, and which note value gets one beat.",
      },
      {
        front: "What is syncopation?",
        back: "Accenting the weak beats, or the spaces between them.",
      },
      {
        front: "What is a cadence?",
        back: "A progression that closes a phrase, ending it or leaving it hanging.",
      },
    ],
  },
];

export const DEMO_SOURCES: DemoSource[] = [
  {
    title: "Cell structure and division — lecture notes",
    feeds: "Cell biology",
    share: 0.6,
    text: `Cells are the basic unit of structure and function in living things.

The cell membrane is a selectively permeable barrier. It controls what enters and leaves the cell, and it is made of a phospholipid bilayer with embedded proteins.

The mitochondrion generates most of the chemical energy that a cell needs. Energy released by the mitochondrion is stored in a molecule called ATP, which carries usable energy to wherever it is needed and releases it when its phosphate bond breaks.

Ribosomes assemble proteins. They translate messenger RNA into chains of amino acids, following the instructions carried out of the nucleus.

Mitosis is the process by which a single cell divides into two genetically identical cells. It is how an organism grows and repairs itself. Meiosis is different: it produces four gametes, each with half the chromosome number, which is what makes sexual reproduction possible.

Apoptosis is programmed cell death. The body uses it to remove cells it no longer needs, and when it fails the result is uncontrolled growth.`,
  },
  {
    title: "Irregular Spanish verbs — cheat sheet",
    feeds: "Spanish verbs",
    share: 0.5,
    text: `Ser and estar both mean "to be" and are not interchangeable.

Ser is for what is permanent or defining: identity, origin, profession, and the essential nature of a thing. Estar is for what is temporary or conditional: location, mood, and current condition.

Tener means to have, and is also how Spanish expresses age — one has years rather than being them.

Poder means to be able to. It is a stem-changing verb, where the o becomes ue in most forms.

Querer means to want, and changes its stem from e to ie.

Saber and conocer both mean to know. Saber is knowing a fact or how to do something. Conocer is knowing a person, a place, or being acquainted with a work.

Decir, venir, hacer, ir and dar are all irregular in the first person singular and simply have to be learned.`,
  },
  {
    title: "Thinking, Fast and Slow — chapter notes",
    feeds: "Cognitive biases",
    share: 0.4,
    text: `The availability heuristic is judging how likely something is by how easily examples come to mind. A vivid recent event feels more probable than a dull common one.

Confirmation bias is seeking out and weighting evidence that supports what you already believe, and reading ambiguous evidence as support.

Anchoring is letting the first number you hear pull every later estimate toward it, even when you know the number was arbitrary.

Loss aversion is feeling a loss roughly twice as strongly as an equivalent gain, which is why people reject fair bets.

The planning fallacy is underestimating how long a task will take, even when similar tasks have overrun before.

Survivorship bias is drawing conclusions from the cases that survived, having lost sight of the ones that did not.`,
  },
];
