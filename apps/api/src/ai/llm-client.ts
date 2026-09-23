import { GoogleGenerativeAI } from "@google/generative-ai";
import { type ZodType } from "zod";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/error.middleware.js";

export interface LLMRequest {
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
}

export interface GenerationContext {
  generationId?: string;
  deadline?: number; // timestamp in ms
  callCount?: number;
  maxCalls?: number;
  incrementCallCount?: () => void;
}

export interface LLMProvider {
  generateStructured<T>(
    request: LLMRequest,
    schema: ZodType<T, any, any>,
    context?: GenerationContext
  ): Promise<T>;
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) or extracts JSON substrings.
 */
export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();

  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  // If there is still outer text, attempt extracting outermost JSON object or array
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf("]");
  }

  if (startIdx !== -1 && endIdx > startIdx) {
    return cleaned.slice(startIdx, endIdx + 1).trim();
  }

  return cleaned;
}

/**
 * Evaluates whether an error is permanently non-retryable (400, 401, 403, invalid config, etc.).
 */
export function isNonRetryableError(err: unknown): boolean {
  if (!err) return false;
  const errorObj = err as Record<string, unknown>;
  const msg = ((err as Error)?.message || "").toLowerCase();
  const status = errorObj.status || (errorObj.response as Record<string, unknown>)?.status;

  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return true;
  }

  if (
    msg.includes("api key not valid") ||
    msg.includes("invalid api key") ||
    msg.includes("api_key_invalid") ||
    msg.includes("permission_denied") ||
    msg.includes("invalid argument") ||
    msg.includes("not found") ||
    msg.includes("unsupported model")
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether an error is transient and retryable (429, 500, 502, 503, 504, timeout, network failure).
 */
export function isRetryableError(err: unknown): boolean {
  if (isNonRetryableError(err)) return false;
  const errorObj = err as Record<string, unknown>;
  const msg = ((err as Error)?.message || "").toLowerCase();
  const status = errorObj.status || (errorObj.response as Record<string, unknown>)?.status;

  if (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }

  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("overloaded") ||
    msg.includes("service unavailable") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
}

/**
 * Extracts Retry-After delay if provided by the response headers or error message.
 * Caps the delay at MAX_RETRY_DELAY_MS.
 */
export function extractRetryDelayMs(err: unknown, attempt: number, maxDelayMs = env.MAX_RETRY_DELAY_MS): number {
  const defaultDelay = Math.min(
    maxDelayMs,
    Math.pow(2, attempt) * 1000 + Math.random() * 400
  );

  if (!err) return defaultDelay;

  const errorObj = err as Record<string, unknown>;
  const msg = (err as Error)?.message || "";

  // Check headers if available
  const responseHeaders = (errorObj.response as Record<string, unknown>)?.headers as Record<string, string> | undefined;
  const retryAfterHeader = responseHeaders?.["retry-after"] || responseHeaders?.["Retry-After"];

  if (retryAfterHeader) {
    const seconds = parseFloat(retryAfterHeader);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(maxDelayMs, Math.round(seconds * 1000));
    }
  }

  // Check regex in message (e.g., "retry in 3.5s" or "Retry-After: 4")
  const matchSec = msg.match(/retry(?:ing)? after (\d+(?:\.\d+)?)\s*s/i) || msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (matchSec && matchSec[1]) {
    const seconds = parseFloat(matchSec[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(maxDelayMs, Math.round(seconds * 1000));
    }
  }

  return defaultDelay;
}

/**
 * Gemini implementation of LLMProvider with:
 * - Classified retry policy (fast-fail on non-retryable 400/401/403, bounded retries on 429/5xx)
 * - Automatic model fallback (gemini-3.6-flash -> gemini-3.5-flash)
 * - Exact 1-attempt JSON/schema repair policy
 * - Respect for Retry-After headers with capping
 * - Global generation deadline and call budget enforcement
 * - Structured JSON observability (no secret leaking)
 */
export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI | null = null;
  public primaryModel: string;
  public fallbackModel: string;

  constructor(
    apiKey = env.GEMINI_API_KEY || "",
    model = env.GEMINI_MODEL || "gemini-3.6-flash",
    fallbackModel = env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash"
  ) {
    this.primaryModel = model;
    this.fallbackModel = fallbackModel;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async generateStructured<T>(
    request: LLMRequest,
    schema: ZodType<T, any, any>,
    context?: GenerationContext
  ): Promise<T> {
    if (!this.genAI) {
      throw new AppError(
        500,
        "LLM_NOT_CONFIGURED",
        "GEMINI_API_KEY is not configured in environment variables."
      );
    }

    // Determine models to try: primary first, fallback if distinct
    const modelsToTry =
      this.fallbackModel && this.fallbackModel !== this.primaryModel
        ? [this.primaryModel, this.fallbackModel]
        : [this.primaryModel];

    let lastError: unknown;

    for (const modelName of modelsToTry) {
      const isFallback = modelName !== this.primaryModel;
      if (isFallback) {
        logger.warn(
          {
            generationId: context?.generationId,
            primary: this.primaryModel,
            fallback: modelName,
          },
          "Primary model exhausted attempts; activating fallback model"
        );
      }

      try {
        const result = await this._tryWithRetries<T>(
          request,
          schema,
          modelName,
          isFallback,
          context
        );
        return result;
      } catch (err) {
        lastError = err;

        // If non-retryable error, immediately abort without fallback
        if (isNonRetryableError(err)) {
          logger.error(
            {
              generationId: context?.generationId,
              model: modelName,
              error: (err as Error)?.message,
            },
            "Non-retryable error encountered; halting model attempts"
          );
          throw err;
        }

        // If primary model failed and fallback is available, try fallback
        if (!isFallback && modelsToTry.length > 1) {
          continue;
        }
      }
    }

    throw new AppError(
      502,
      "LLM_GENERATION_FAILED",
      `LLM generation failed across ${modelsToTry.length} model(s): ${(lastError as Error)?.message || "Unknown error"}`
    );
  }

  /**
   * Attempts LLM generation with bounded retries, Retry-After capping, and single-attempt schema repair.
   */
  private async _tryWithRetries<T>(
    request: LLMRequest,
    schema: ZodType<T, any, any>,
    modelName: string,
    isFallback: boolean,
    context?: GenerationContext
  ): Promise<T> {
    const maxAttempts = env.MAX_ATTEMPTS_PER_MODEL ?? 2;
    let attempt = 0;
    let lastError: unknown;

    const model = this.genAI!.getGenerativeModel({
      model: modelName,
      systemInstruction: request.systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: request.temperature ?? 0.2,
      },
    });

    while (attempt < maxAttempts) {
      attempt++;

      // Check deadline
      if (context?.deadline && Date.now() > context.deadline) {
        throw new AppError(
          504,
          "GENERATION_TIMEOUT",
          "Generation exceeded configured deadline"
        );
      }

      // Check call budget
      if (
        context?.maxCalls !== undefined &&
        context?.callCount !== undefined &&
        context.callCount >= context.maxCalls
      ) {
        throw new AppError(
          500,
          "LLM_CALL_BUDGET_EXCEEDED",
          `Exceeded maximum LLM call budget (${context.maxCalls} calls)`
        );
      }

      context?.incrementCallCount?.();

      const startTime = Date.now();
      try {
        logger.debug(
          {
            generationId: context?.generationId,
            model: modelName,
            attempt,
            fallbackUsed: isFallback,
          },
          "Dispatching Gemini generateContent call"
        );

        const result = await model.generateContent(request.prompt);
        const durationMs = Date.now() - startTime;
        const rawText = result.response.text();

        if (!rawText) {
          throw new Error("Empty response received from LLM");
        }

        const cleanedJson = cleanJsonOutput(rawText);
        let parsedJson: unknown;
        let jsonParseError = false;

        try {
          parsedJson = JSON.parse(cleanedJson);
        } catch {
          jsonParseError = true;
        }

        // Schema validation
        let validated: T | null = null;
        if (!jsonParseError) {
          const val = schema.safeParse(parsedJson);
          if (val.success) {
            validated = val.data;
          }
        }

        // If initial generation valid, return immediately
        if (validated !== null) {
          logger.info(
            {
              generationId: context?.generationId,
              provider: "gemini",
              model: modelName,
              attempt,
              durationMs,
              status: "success",
              fallbackUsed: isFallback,
            },
            "Gemini generation call succeeded"
          );
          return validated;
        }

        // --------------------------------------------------------------------
        // Single Repair Attempt Policy (Phase 8)
        // --------------------------------------------------------------------
        logger.warn(
          {
            generationId: context?.generationId,
            model: modelName,
            attempt,
            jsonParseError,
          },
          "Response failed JSON/schema validation; initiating single repair attempt"
        );

        // Check deadline and budget before repair call
        if (context?.deadline && Date.now() > context.deadline) {
          throw new AppError(504, "GENERATION_TIMEOUT", "Generation deadline exceeded during repair");
        }
        if (
          context?.maxCalls !== undefined &&
          context?.callCount !== undefined &&
          context.callCount >= context.maxCalls
        ) {
          throw new AppError(500, "LLM_CALL_BUDGET_EXCEEDED", "Exceeded call budget during repair");
        }

        context?.incrementCallCount?.();
        const repairStart = Date.now();
        const repairPrompt = `${request.prompt}\n\nCRITICAL FIX REQUIRED: Your previous output was invalid.\nPrevious response:\n${rawText.slice(0, 1500)}\n\nOutput ONLY valid JSON adhering strictly to the schema without markdown commentary.`;

        const repairResult = await model.generateContent(repairPrompt);
        const repairRaw = repairResult.response.text();
        const repairCleaned = cleanJsonOutput(repairRaw);
        const repairParsed = JSON.parse(repairCleaned);
        const repairValidation = schema.parse(repairParsed);

        logger.info(
          {
            generationId: context?.generationId,
            provider: "gemini",
            model: modelName,
            repairDurationMs: Date.now() - repairStart,
            status: "repaired",
          },
          "Single repair attempt succeeded"
        );

        return repairValidation;
      } catch (err: unknown) {
        lastError = err;
        const durationMs = Date.now() - startTime;

        // If non-retryable error, immediately abort
        if (isNonRetryableError(err)) {
          logger.error(
            {
              generationId: context?.generationId,
              model: modelName,
              attempt,
              durationMs,
              error: (err as Error)?.message,
            },
            "Non-retryable LLM provider error encountered"
          );
          throw err;
        }

        if (!isRetryableError(err)) {
          logger.warn(
            {
              generationId: context?.generationId,
              model: modelName,
              attempt,
              error: (err as Error)?.message,
            },
            "Error classified as unretryable"
          );
          throw err;
        }

        if (attempt < maxAttempts) {
          const delayMs = extractRetryDelayMs(err, attempt);
          logger.warn(
            {
              generationId: context?.generationId,
              model: modelName,
              attempt,
              delayMs,
              retryReason: (err as Error)?.message?.slice(0, 120),
            },
            "Transient error encountered; applying bounded retry with backoff"
          );
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    throw new AppError(
      502,
      "LLM_MODEL_EXHAUSTED",
      `Model ${modelName} exhausted ${maxAttempts} attempt(s): ${(lastError as Error)?.message || "Unknown error"}`
    );
  }
}

/**
 * Mock LLM Provider for unit testing and offline evaluation.
 */
export class MockLLMProvider implements LLMProvider {
  private handlers: Map<string, unknown> = new Map();
  public callCount = 0;

  setMockResponse(keySubstring: string, response: unknown): void {
    this.handlers.set(keySubstring, response);
  }

  async generateStructured<T>(
    request: LLMRequest,
    schema: ZodType<T, any, any>,
    context?: GenerationContext
  ): Promise<T> {
    this.callCount++;
    context?.incrementCallCount?.();

    if (context?.deadline && Date.now() > context.deadline) {
      throw new AppError(504, "GENERATION_TIMEOUT", "Generation deadline exceeded");
    }

    if (
      context?.maxCalls !== undefined &&
      context?.callCount !== undefined &&
      context.callCount > context.maxCalls
    ) {
      throw new AppError(500, "LLM_CALL_BUDGET_EXCEEDED", "Exceeded call budget");
    }

    for (const [key, response] of this.handlers.entries()) {
      if (
        request.prompt.includes(key) ||
        (request.systemInstruction && request.systemInstruction.includes(key))
      ) {
        return schema.parse(response);
      }
    }

    if (this.handlers.size === 1) {
      return schema.parse(Array.from(this.handlers.values())[0]);
    }

    throw new Error(
      `MockLLMProvider: No mock response matched for prompt: ${request.prompt.substring(0, 80)}...`
    );
  }
}

export const defaultLLMProvider: LLMProvider = new GeminiProvider();
