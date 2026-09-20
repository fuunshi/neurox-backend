/**
 * The TU BCA syllabus, as data.
 *
 * This is **reference data, not demo data** — the difference matters, because
 * it is why this lives apart from `seeder.service.ts`. The demo seeder builds a
 * fake reader with a fake history and is meant to be run in development only;
 * the syllabus is the same in every environment, including production, and a
 * deploy that lacks it has no navigation at all. `curriculum.service.ts`
 * upserts it by path, so running it twice is a no-op.
 *
 * **Semesters and subjects only — no units.** The unit lists differ between
 * curricula and between colleges, and inventing them would put structure on the
 * site that the owner then has to correct. Units get created as real notes are
 * written against them. A note may hang off a subject directly in the meantime.
 *
 * Codes follow the revised curriculum (`BCA 101`–`BCA 454`). The older
 * `CASC`/`CACS` codes are still in circulation for students who enrolled
 * earlier; adding that as a second course is a data change, not a code change.
 */
export interface SeedSubject {
  slug: string;
  title: string;
  code: string;
}

export interface SeedSemester {
  /** One-based. TU numbers its semesters, and the site does too. */
  number: number;
  subjects: SeedSubject[];
}

export interface SeedCourse {
  slug: string;
  title: string;
  code: string;
  description: string;
  semesters: SeedSemester[];
}

export const TU_BCA: SeedCourse = {
  slug: "bca",
  /**
   * Parentheses rather than an em dash, deliberately.
   *
   * The title tag template already appends "— neurox", and the pages append
   * their own qualifier, so a dash inside the name itself produces
   * "BCA — Bachelor of Computer Applications — all semesters — neurox": three
   * dashes and a title that reads like a list of fragments. Bracketing the
   * expansion keeps the short name available as everything before the bracket,
   * which is what the frontend uses to build titles.
   */
  title: "BCA (Bachelor of Computer Applications)",
  code: "TU",
  description:
    "Four years, eight semesters, 126 credit hours, under Tribhuvan University's Faculty of Humanities and Social Sciences. Every subject below is common to all TU-affiliated colleges.",
  semesters: [
    {
      number: 1,
      subjects: [
        {
          slug: "computer-fundamental-and-application",
          title: "Computer Fundamental and Application",
          code: "BCA 101",
        },
        {
          slug: "programming-in-c",
          title: "Programming in C",
          code: "BCA 102",
        },
        { slug: "digital-logic", title: "Digital Logic", code: "BCA 103" },
        { slug: "mathematics-1", title: "Mathematics I", code: "BCA 104" },
        {
          slug: "professional-communication-and-ethics",
          title: "Professional Communication and Ethics",
          code: "BCA 105",
        },
      ],
    },
    {
      number: 2,
      subjects: [
        {
          slug: "discrete-structure",
          title: "Discrete Structure",
          code: "BCA 151",
        },
        {
          slug: "microprocessor-and-computer-architecture",
          title: "Microprocessor and Computer Architecture",
          code: "BCA 152",
        },
        { slug: "oop-in-java", title: "OOP in Java", code: "BCA 153" },
        { slug: "mathematics-2", title: "Mathematics II", code: "BCA 154" },
        { slug: "ux-ui-design", title: "UX/UI Design", code: "BCA 155" },
      ],
    },
    {
      number: 3,
      subjects: [
        {
          slug: "data-structure-and-algorithms",
          title: "Data Structure and Algorithms",
          code: "BCA 201",
        },
        {
          slug: "database-management-system",
          title: "Database Management System",
          code: "BCA 202",
        },
        {
          slug: "web-technology-1",
          title: "Web Technology I",
          code: "BCA 203",
        },
        {
          slug: "system-analysis-and-design",
          title: "System Analysis and Design",
          code: "BCA 204",
        },
        {
          slug: "probability-and-statistics",
          title: "Probability and Statistics",
          code: "BCA 205",
        },
      ],
    },
    {
      number: 4,
      subjects: [
        {
          slug: "operating-systems",
          title: "Operating Systems",
          code: "BCA 251",
        },
        {
          slug: "software-engineering",
          title: "Software Engineering",
          code: "BCA 252",
        },
        {
          slug: "numerical-methods",
          title: "Numerical Methods",
          code: "BCA 253",
        },
        {
          slug: "python-programming",
          title: "Python Programming",
          code: "BCA 254",
        },
        {
          slug: "web-technology-2",
          title: "Web Technology II",
          code: "BCA 255",
        },
      ],
    },
    {
      number: 5,
      subjects: [
        {
          slug: "computer-network",
          title: "Computer Network",
          code: "BCA 301",
        },
        {
          slug: "artificial-intelligence",
          title: "Artificial Intelligence",
          code: "BCA 302",
        },
        {
          slug: "advanced-java-programming",
          title: "Advanced Java Programming",
          code: "BCA 303",
        },
        {
          slug: "mis-and-e-business",
          title: "MIS and e-Business",
          code: "BCA 304",
        },
        {
          slug: "society-and-technology",
          title: "Society and Technology",
          code: "BCA 305",
        },
      ],
    },
    {
      number: 6,
      subjects: [
        {
          slug: "computer-graphics-and-animation",
          title: "Computer Graphics and Animation",
          code: "BCA 351",
        },
        {
          slug: "mobile-programming",
          title: "Mobile Programming",
          code: "BCA 352",
        },
        {
          slug: "cryptography-and-network-security",
          title: "Cryptography and Network Security",
          code: "BCA 353",
        },
        {
          slug: "technical-writing",
          title: "Technical Writing",
          code: "BCA 354",
        },
        {
          slug: "distributed-system",
          title: "Distributed System",
          code: "BCA 355",
        },
      ],
    },
    {
      number: 7,
      subjects: [
        {
          slug: "cyber-security-and-ethical-hacking",
          title: "Cyber Security and Ethical Hacking",
          code: "BCA 401",
        },
        {
          slug: "software-project-management",
          title: "Software Project Management",
          code: "BCA 402",
        },
        {
          slug: "financial-accounting",
          title: "Financial Accounting",
          code: "BCA 403",
        },
      ],
    },
    {
      number: 8,
      subjects: [
        { slug: "cloud-computing", title: "Cloud Computing", code: "BCA 451" },
      ],
    },
  ],
};

/**
 * Starter notes.
 *
 * Exactly one, and it is a real note rather than lorem ipsum: it exists so the
 * reading page, the metadata, the breadcrumb and the sitemap have something
 * genuine to render from the first deploy. It is seeded by slug, so editing it
 * on the site is safe — the seeder will not overwrite it once it exists.
 */
export interface SeedNote {
  /** The subject this belongs to, by slug. */
  subject: string;
  slug: string;
  title: string;
  excerpt: string;
  readingMinutes: number;
  bodyMarkdown: string;
}

export const STARTER_NOTES: SeedNote[] = [
  {
    subject: "data-structure-and-algorithms",
    slug: "big-o-notation",
    title: "Big-O Notation",
    excerpt:
      "How computer scientists describe the way a program's cost grows as its input grows — and why an algorithm that is faster on your laptop can be the wrong one on a server.",
    readingMinutes: 6,
    bodyMarkdown: `Big-O notation describes how the **cost** of an algorithm grows as the **size of its input** grows. It says nothing about how many seconds a particular program takes on a particular machine. That distinction is the whole subject, and it is where most confusion starts.

## Why not just time the program?

Because the answer would be about your computer, not about the algorithm. A slow machine makes every algorithm slower by the same factor, and a good compiler makes every algorithm faster by the same factor — so the machine and the compiler cancel out when you compare two algorithms. What does *not* cancel out is how each one responds to a bigger input.

An algorithm that scans a list once takes twice as long on a list twice as long. An algorithm that compares every element with every other element takes **four times** as long on a list twice as long. No amount of hardware changes that. That difference is what Big-O captures.

## Reading the notation

When we write that an algorithm is **O(n)**, read it as: *as n grows large, the running time grows at most proportionally to n*.

| Notation | Name | Grows like | Typical example |
| --- | --- | --- | --- |
| O(1) | Constant | Stays the same | Reading \`arr[5]\` |
| O(log n) | Logarithmic | Barely moves | Binary search |
| O(n) | Linear | In step with the input | Scanning a list |
| O(n log n) | Linearithmic | Slightly worse than linear | Merge sort |
| O(n²) | Quadratic | Square of the input | Comparing every pair |
| O(2ⁿ) | Exponential | Astronomically | Trying every subset |

## Concretely, with numbers

Take n = 1,000. Compare the number of operations:

- **O(log n)** — about **10**. Doubling n to 2,000 adds *one* more step.
- **O(n)** — **1,000**. Doubling n doubles the work.
- **O(n²)** — **1,000,000**. Doubling n *quadruples* the work.
- **O(2ⁿ)** — a number with about 300 digits. Not running today.

This is why an O(n²) algorithm can feel instant on the twenty rows you tested with and take a minute on the twenty thousand rows in production. The problem was always there; the test data was too small to show it.

## The three rules for working it out

1. **Drop the constants.** O(2n) and O(n) are both written O(n). Constants matter in practice, but Big-O is about growth, and a constant factor does not change growth.
2. **Drop the smaller terms.** O(n² + n) is written O(n²). Once n is large, the n² term dominates everything else.
3. **Nested loops multiply; sequential loops add.** A loop inside a loop over the same n is O(n²). Two loops one after the other is O(n + n), which is O(n).

## What Big-O does not tell you

**Big-O is about large inputs only.** For small n — and "small" is often larger than people expect — an O(n²) insertion sort genuinely beats an O(n log n) merge sort, because merge sort's constant factors are larger and its overhead is real. This is not a technicality: production sorting libraries switch to insertion sort below a threshold for exactly this reason.

**Big-O hides constants that can be enormous.** An O(n) algorithm that runs a database query per element and an O(n) algorithm that adds an integer per element are the same Big-O and nothing like the same speed.

**Big-O describes the worst case unless it says otherwise.** Quicksort is O(n log n) on average and O(n²) in the worst case. Both statements are true, and quoting only the first is how you end up surprised by sorted input.

**Big-O is about time, but it applies to space too.** An algorithm can be fast and still be unusable because it needs O(n) extra memory. Space complexity is written the same way.`,
  },
];
