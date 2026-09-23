import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  GeminiProvider,
  isRetryableError,
  isNonRetryableError,
  extractRetryDelayMs,
  cleanJsonOutput,
} from "../../apps/api/src/ai/llm-client.js";

describe("LLM Retry Classification", () => {
  it("should classify 400, 401, 403, and invalid API key errors as non-retryable", () => {
    expect(isNonRetryableError({ status: 400, message: "Bad Request" })).toBe(true);
    expect(isNonRetryableError({ status: 401, message: "Unauthorized" })).toBe(true);
    expect(isNonRetryableError({ status: 403, message: "Forbidden" })).toBe(true);
    expect(isNonRetryableError({ status: 404, message: "Not Found" })).toBe(true);
    expect(isNonRetryableError(new Error("API key not valid. Please pass a valid API key."))).toBe(true);
    expect(isNonRetryableError(new Error("PERMISSION_DENIED"))).toBe(true);

    // Should NOT be classified as retryable
    expect(isRetryableError({ status: 400, message: "Bad Request" })).toBe(false);
    expect(isRetryableError({ status: 401, message: "Unauthorized" })).toBe(false);
    expect(isRetryableError({ status: 403, message: "Forbidden" })).toBe(false);
  });

  it("should classify 429, 500, 502, 503, 504, and network errors as retryable", () => {
    expect(isRetryableError({ status: 429, message: "Too Many Requests" })).toBe(true);
    expect(isRetryableError({ status: 500, message: "Internal Server Error" })).toBe(true);
    expect(isRetryableError({ status: 502, message: "Bad Gateway" })).toBe(true);
    expect(isRetryableError({ status: 503, message: "Service Unavailable" })).toBe(true);
    expect(isRetryableError({ status: 504, message: "Gateway Timeout" })).toBe(true);
    expect(isRetryableError(new Error("RESOURCE_EXHAUSTED: quota exceeded"))).toBe(true);
    expect(isRetryableError(new Error("The model is overloaded. Please try again later."))).toBe(true);
    expect(isRetryableError(new Error("fetch failed: ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
  });
});

describe("Retry-After Parsing & Capping", () => {
  it("should parse Retry-After from response headers and cap at maxDelayMs", () => {
    const errorWithHeader = {
      response: {
        headers: { "retry-after": "5" },
      },
      message: "429 Too Many Requests",
    };
    const delay = extractRetryDelayMs(errorWithHeader, 1, 10000);
    expect(delay).toBe(5000);

    // Capped at 10000ms
    const errorLarge = {
      response: {
        headers: { "retry-after": "60" },
      },
      message: "429 Too Many Requests",
    };
    const delayCapped = extractRetryDelayMs(errorLarge, 1, 10000);
    expect(delayCapped).toBe(10000);
  });

  it("should parse retry delay from error message string", () => {
    const errorMsg = new Error("Resource exhausted, please retry after 3.5s");
    const delay = extractRetryDelayMs(errorMsg, 1, 10000);
    expect(delay).toBe(3500);
  });
});

describe("JSON Cleaning and Output Extraction", () => {
  it("should clean markdown fences and extract pure JSON", () => {
    const fenced = "```json\n{\"title\": \"Engineer\"}\n```";
    expect(cleanJsonOutput(fenced)).toBe("{\"title\": \"Engineer\"}");

    const withSurroundingProse = "Here is the response:\n```json\n{\"key\": 123}\n```\nHope that helps!";
    expect(cleanJsonOutput(withSurroundingProse)).toBe("{\"key\": 123}");

    const rawJson = "{\"status\": \"ok\"}";
    expect(cleanJsonOutput(rawJson)).toBe("{\"status\": \"ok\"}");
  });
});

describe("Gemini Fallback Model Execution", () => {
  const Schema = z.object({ value: z.string() });

  it("should fall back to fallbackModel when primaryModel exhausts retryable errors", async () => {
    const provider = new GeminiProvider("mock-api-key", "gemini-3.6-flash", "gemini-3.5-flash");

    // Mock internal genAI
    const primaryGenerate = vi.fn().mockRejectedValue({
      status: 503,
      message: "Service Unavailable: model overloaded",
    });

    const fallbackGenerate = vi.fn().mockResolvedValue({
      response: {
        text: () => JSON.stringify({ value: "success_from_fallback" }),
      },
    });

    (provider as any).genAI = {
      getGenerativeModel: vi.fn(({ model }) => {
        if (model === "gemini-3.6-flash") {
          return { generateContent: primaryGenerate };
        }
        if (model === "gemini-3.5-flash") {
          return { generateContent: fallbackGenerate };
        }
        throw new Error(`Unexpected model ${model}`);
      }),
    };

    const result = await provider.generateStructured(
      { prompt: "test prompt" },
      Schema
    );

    expect(result).toEqual({ value: "success_from_fallback" });
    // Primary was attempted up to MAX_ATTEMPTS (2)
    expect(primaryGenerate).toHaveBeenCalledTimes(2);
    // Fallback was activated and succeeded on attempt 1
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it("should not fall back and not retry on non-retryable 401 error", async () => {
    const provider = new GeminiProvider("mock-api-key", "gemini-3.6-flash", "gemini-3.5-flash");

    const primaryGenerate = vi.fn().mockRejectedValue({
      status: 401,
      message: "API key not valid",
    });

    const fallbackGenerate = vi.fn();

    (provider as any).genAI = {
      getGenerativeModel: vi.fn(() => ({
        generateContent: primaryGenerate,
      })),
    };

    await expect(
      provider.generateStructured({ prompt: "test prompt" }, Schema)
    ).rejects.toMatchObject({
      status: 401,
    });

    // Primary attempted only ONCE (fast fail)
    expect(primaryGenerate).toHaveBeenCalledTimes(1);
    // Fallback never called
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });
});
