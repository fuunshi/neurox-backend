import { registerAs } from "@nestjs/config";

/**
 * The `neurox-brain` service — where it is, and how to reach it.
 *
 * **`enabled` is explicit rather than inferred from the URL.** It would be
 * convenient to treat "a URL is configured" as "use it", but the URL has a
 * working localhost default, so that rule would make every developer's machine
 * depend on a Python service being up. An explicit switch means the default
 * behaviour is the one that already works, and turning the brain on is a
 * decision rather than an accident of what happens to be running.
 *
 * When it is disabled the generator reports itself unavailable and the existing
 * provider chain picks the next one — see `defaultGenerator()`. Nothing else
 * changes.
 */
export default registerAs("neuroxBrain", () => ({
  enabled: (process.env.NEUROX_BRAIN_ENABLED ?? "false") === "true",

  baseUrl: (process.env.NEUROX_BRAIN_URL || "http://localhost:8000").replace(
    /\/+$/,
    "",
  ),

  /**
   * How jobs reach it: a direct HTTP call, or a queue.
   *
   * `http` holds the request open and waits — correct for the chunk sizes the
   * generator actually sends, and it needs no extra infrastructure.
   *
   * `amqp` publishes the job and waits for the answer on a reply queue. Worth
   * it when a document is large enough that a worker holding a connection open
   * for thirty seconds is the wrong shape, and when a broker is already
   * running. Both transports present the same `analyse()` signature, so this
   * is a deployment choice rather than a code one.
   */
  transport: (process.env.NEUROX_BRAIN_TRANSPORT || "http") as "http" | "amqp",

  /**
   * Seconds before a request is abandoned.
   *
   * Sized against the service's own measurement rather than guessed: a
   * 2,000-character chunk parses and extracts in roughly 1.5s on the reference
   * machine, and the generator sends chunks one at a time, so this is per
   * chunk with room for a slower host.
   */
  timeoutMs: parseInt(process.env.NEUROX_BRAIN_TIMEOUT_MS || "30000", 10),

  amqpUrl:
    process.env.NEUROX_BRAIN_AMQP_URL || "amqp://neurox:neurox@localhost:5672",
  amqpJobQueue: process.env.NEUROX_BRAIN_JOB_QUEUE || "brain.jobs",
  amqpResultQueue: process.env.NEUROX_BRAIN_RESULT_QUEUE || "brain.results",

  /**
   * Shared secret for the webhook signature.
   *
   * The HTTP and AMQP paths are initiated by this process, so the response
   * arrives on a connection it opened. A webhook is the reverse: the brain
   * service calls *us*, and without a signature any host that can reach the
   * callback endpoint could inject a result — and a result is what writes cards
   * into somebody's deck.
   */
  webhookSecret: process.env.NEUROX_BRAIN_WEBHOOK_SECRET || "",
}));
