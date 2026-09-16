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

export interface LLMProvider {
  generateStructured<T>(request: LLMRequest, schema: ZodType<T, any, any>): Promise<T>;
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) from LLM responses.
 */
function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Gemini implementation of LLMProvider with structured JSON output,
 * retry with exponential backoff for rate limits, and schema validation.
 */
export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI | null = null;
  private modelName: string;

  constructor(apiKey = env.GEMINI_API_KEY || "", model = env.GEMINI_MODEL || "gemini-2.0-flash") {
    this.modelName = model;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async generateStructured<T>(request: LLMRequest, schema: ZodType<T, any, any>): Promise<T> {
    if (!this.genAI) {
      throw new AppError(
        500,
        "LLM_NOT_CONFIGURED",
        "GEMINI_API_KEY is not configured in environment variables."
      );
    }

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: request.systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: request.temperature ?? 0.2,
      },
    });

    const MAX_ATTEMPTS = 3;
    let attempt = 0;
    let lastError: unknown;
    let currentPrompt = request.prompt;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        logger.debug({ model: this.modelName, attempt }, "Calling Gemini API");
        const result = await model.generateContent(currentPrompt);
        const rawText = result.response.text();

        if (!rawText) {
          throw new Error("Empty response from LLM");
        }

        const cleanedJson = cleanJsonOutput(rawText);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(cleanedJson);
        } catch (jsonErr) {
          logger.warn({ rawText, jsonErr }, "Malformed JSON from LLM, attempting repair");
          currentPrompt = `${request.prompt}\n\nCRITICAL: Your previous output was not valid JSON:\n${rawText}\n\nFix the JSON syntax and output ONLY valid JSON matching the required schema.`;
          continue;
        }

        const validation = schema.safeParse(parsedJson);
        if (validation.success) {
          return validation.data;
        }

        logger.warn(
          { issues: validation.error.issues },
          "LLM response failed schema validation, attempting repair"
        );
        currentPrompt = `${request.prompt}\n\nCRITICAL: Your output failed schema validation:\n${JSON.stringify(
          validation.error.issues,
          null,
          2
        )}\n\nCorrect the structure and return valid JSON adhering strictly to the schema.`;
      } catch (err: unknown) {
        lastError = err;
        const msg = (err as Error)?.message || "";

        // Handle rate limiting (429 / RESOURCE_EXHAUSTED)
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          const backoff = Math.pow(2, attempt) * 1500 + Math.random() * 500;
          logger.warn({ attempt, backoff }, "Gemini rate limited, applying exponential backoff");
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        logger.error({ err, attempt }, "Gemini generation attempt error");
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new AppError(
      502,
      "LLM_GENERATION_FAILED",
      `LLM generation failed after ${MAX_ATTEMPTS} attempts: ${(lastError as Error)?.message || "Unknown error"}`
    );
  }
}

/**
 * Mock LLM Provider for unit testing and deterministic offline evaluation.
 */
export class MockLLMProvider implements LLMProvider {
  private handlers: Map<string, unknown> = new Map();

  setMockResponse(keySubstring: string, response: unknown): void {
    this.handlers.set(keySubstring, response);
  }

  async generateStructured<T>(request: LLMRequest, schema: ZodType<T, any, any>): Promise<T> {
    for (const [key, response] of this.handlers.entries()) {
      if (request.prompt.includes(key) || (request.systemInstruction && request.systemInstruction.includes(key))) {
        return schema.parse(response);
      }
    }

    // Default fallback: parse response if only 1 handler exists
    if (this.handlers.size === 1) {
      return schema.parse(Array.from(this.handlers.values())[0]);
    }

    throw new Error(`MockLLMProvider: No mock response matched for prompt: ${request.prompt.substring(0, 80)}...`);
  }
}

export const defaultLLMProvider: LLMProvider = new GeminiProvider();
