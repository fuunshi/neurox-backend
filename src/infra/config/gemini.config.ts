import { registerAs } from "@nestjs/config";

/**
 * Gemini credentials and model choice.
 *
 * The API key is optional on purpose. Card generation falls back to the
 * deterministic heuristic generator when it is absent, so the whole pipeline
 * stays exercisable — and the test suite stays offline — without a key. An empty
 * key is a supported state, not a misconfiguration.
 */
export default registerAs("gemini", () => ({
  apiKey: process.env.GEMINI_API_KEY || "",
  /** Flash is the default: card extraction is a bounded, well-specified task,
   *  and it is the cheapest model that does it well. */
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  /** Seconds before a generation request is abandoned. */
  timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || "60000", 10),
}));
