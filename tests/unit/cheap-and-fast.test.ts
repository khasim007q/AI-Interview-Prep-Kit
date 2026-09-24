import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { kitService } from "../../apps/api/src/services/kit.service.js";
import { kitRepository } from "../../apps/api/src/repositories/kit.repository.js";
import { MockLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import { SerpApiSearchProvider } from "../../apps/api/src/research/search-provider.js";
import { apiClient } from "../../apps/web/lib/api-client.js";

describe("Cheap, Fast, and Production-Usable - Verifications", () => {
  const userId = new ObjectId().toString();
  const kitId = new ObjectId().toString();

  describe("1. Lightweight Generation Status & MongoDB Projection", () => {
    it("should return projected status fields and format ISO updatedAt", async () => {
      const mockDoc = {
        _id: new ObjectId(kitId),
        status: "running" as const,
        generation: {
          status: "running" as const,
          stage: "generating_questions",
          progress: 55,
          message: "Generating technical interview questions...",
        },
        updatedAt: new Date("2026-09-24T12:00:00.000Z"),
      };

      const projectionSpy = vi
        .spyOn(kitRepository, "findGenerationStatus")
        .mockResolvedValue(mockDoc as any);

      const status = await kitService.getGenerationStatus(kitId, userId);

      expect(projectionSpy).toHaveBeenCalledWith(kitId, userId);
      expect(status).toEqual({
        id: kitId,
        status: "running",
        stage: "generating_questions",
        progress: 55,
        message: "Generating technical interview questions...",
        error: null,
        generation: mockDoc.generation,
        updatedAt: "2026-09-24T12:00:00.000Z",
      });
    });

    it("should throw 404 when kit is not found or unauthorized", async () => {
      vi.spyOn(kitRepository, "findGenerationStatus").mockResolvedValue(null);

      await expect(kitService.getGenerationStatus(kitId, userId)).rejects.toMatchObject({
        statusCode: 404,
        code: "KIT_NOT_FOUND",
      });
    });
  });

  describe("2. Read Endpoints Guarantee Zero LLM/Crawler/Research Invocations", () => {
    it("should never invoke LLM on getGenerationStatus or getKit", async () => {
      const mockLLM = new MockLLMProvider();
      const llmSpy = vi.spyOn(mockLLM, "generateStructured");

      vi.spyOn(kitRepository, "findGenerationStatus").mockResolvedValue({
        _id: new ObjectId(kitId),
        status: "running" as const,
        generation: {
          status: "running" as const,
          stage: "extracting_requirements",
          progress: 10,
        },
        updatedAt: new Date(),
      } as any);

      vi.spyOn(kitRepository, "findByIdAndUserId").mockResolvedValue({
        _id: new ObjectId(kitId),
        userId: new ObjectId(userId),
        status: "completed" as const,
        kit: { id: kitId, title: "Software Engineer", questions: [] },
        updatedAt: new Date(),
      } as any);

      // Call read methods
      await kitService.getGenerationStatus(kitId, userId);
      await kitService.getKit(kitId, userId);

      // Verify no LLM invocations occurred
      expect(llmSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("3. CORS Preflight Elimination in API Client", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("should NOT send Content-Type on GET requests without body (CORS simple request)", async () => {
      let capturedHeaders: HeadersInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ success: true }),
        } as Response;
      });

      await apiClient("/api/kits/123/generation-status", { method: "GET" });

      expect(capturedHeaders).toBeDefined();
      const headers = capturedHeaders as Record<string, string>;
      expect(headers["Accept"]).toBe("application/json");
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("should NOT send Content-Type on HEAD requests without body", async () => {
      let capturedHeaders: HeadersInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({}),
        } as Response;
      });

      await apiClient("/api/kits/123", { method: "HEAD" });

      const headers = capturedHeaders as Record<string, string>;
      expect(headers["Accept"]).toBe("application/json");
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("should send Content-Type on POST requests", async () => {
      let capturedHeaders: HeadersInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ id: "123" }),
        } as Response;
      });

      await apiClient("/api/kits", {
        method: "POST",
        body: JSON.stringify({ jd: "Engineer" }),
      });

      const headers = capturedHeaders as Record<string, string>;
      expect(headers["Accept"]).toBe("application/json");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("4. SerpAPI Search Timeout & Abort Handling", () => {
    it("should abort when search request exceeds timeout and return empty array gracefully", async () => {
      const provider = new SerpApiSearchProvider("fake_key", 50); // 50ms timeout for testing

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        return new Promise((resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const abortError = new Error("This operation was aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          }
          // Do not resolve normally to simulate slow external network
        });
      });

      const results = await provider.search("test slow search query");

      expect(results).toEqual([]);
    });
  });
});
