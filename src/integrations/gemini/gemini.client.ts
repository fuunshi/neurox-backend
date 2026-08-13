import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface GeminiJsonResult<T> {
  value: T;
  /** Provider-reported token counts, recorded on the generation job so two
   *  providers can be compared on the same source later. */
  usage?: Record<string, unknown>;
}

/**
 * Minimal Gemini REST client.
 *
 * Talks to the API directly rather than through `@google/generative-ai`: the
 * call needed here is one POST with a JSON response schema, and the SDK would
 * add a dependency, its own retry semantics and its own error types for no gain
 * at this size.
 *
 * Only what the product uses is implemented. There is deliberately no generic
 * `request(method, endpoint)` passthrough — a thin generic wrapper over a REST
 * API is how an integration ends up with no error handling and no types.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("gemini.apiKey") ?? "";
    this.model =
      this.configService.get<string>("gemini.model") ?? "gemini-2.5-flash";
    this.timeoutMs =
      this.configService.get<number>("gemini.timeoutMs") ?? 60_000;
  }

  /**
   * Whether a key is configured. The generator uses this to decide whether it
   * can run at all, which is what lets the heuristic generator take over
   * automatically when there is no key.
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  get modelName(): string {
    return this.model;
  }

  /**
   * Asks the model for a JSON object matching `responseSchema`.
   *
   * The schema is required rather than prompting for "JSON only": the API
   * enforces it, so the reply is valid JSON of the right shape instead of
   * whatever the model felt like and a hopeful `JSON.parse`.
   */
  async generateJson<T>(options: {
    prompt: string;
    responseSchema: Record<string, unknown>;
    temperature?: number;
  }): Promise<GeminiJsonResult<T>> {
    if (!this.isConfigured()) {
      throw new Error("Gemini API key is not configured");
    }

    const body = {
      contents: [{ parts: [{ text: options.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
        temperature: options.temperature ?? 0.4,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Sent as a header rather than `?key=`, so the credential cannot be
            // captured in a URL that later turns up in a log or a proxy's access
            // log.
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Gemini responded ${response.status}: ${detail.slice(0, 500)}`,
        );
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: Record<string, unknown>;
        promptFeedback?: { blockReason?: string };
      };

      // A safety block arrives as a 200 with no candidates. Reporting it here
      // keeps it from surfacing later as a confusing parse failure.
      if (payload.promptFeedback?.blockReason) {
        throw new Error(
          `Gemini declined the request (${payload.promptFeedback.blockReason})`,
        );
      }

      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("");

      if (!text) {
        throw new Error("Gemini returned no content");
      }

      return {
        value: JSON.parse(text) as T,
        usage: payload.usageMetadata,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // `cause` keeps the abort itself in the chain; without it the timeout
        // looks like a fresh failure rather than a cancelled request.
        throw new Error(`Gemini request timed out after ${this.timeoutMs}ms`, {
          cause: error,
        });
      }

      this.logger.error(
        `Gemini call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
