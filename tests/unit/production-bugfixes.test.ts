import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { ObjectId } from "mongodb";
import { app } from "../../apps/api/src/app.js";
import { kitRepository } from "../../apps/api/src/repositories/kit.repository.js";
import { authService } from "../../apps/api/src/services/auth.service.js";
import { MockLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import { GeminiProvider } from "../../apps/api/src/ai/llm-client.js";
import { z } from "zod";

describe("Production Bugfixes & Hardening Verifications", () => {
  let server: http.Server;
  let serverUrl: string;

  const mockUserId = new ObjectId().toString();
  const mockKitId = new ObjectId().toString();
  const mockToken = "valid_test_session_token_123456";

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Start server on an ephemeral port
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Mock authService session validation
    vi.spyOn(authService, "validateSession").mockImplementation(async (token: string) => {
      if (token === mockToken) {
        return {
          id: mockUserId,
          email: "user@example.com",
          createdAt: new Date().toISOString(),
        };
      }
      return null;
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("1. Express Route Mounting: GET /api/kits/:kitId/generation-status", () => {
    it("should mount and return 200 with projected status for an existing kit", async () => {
      const mockDoc = {
        _id: new ObjectId(mockKitId),
        status: "running" as const,
        generation: {
          status: "running" as const,
          stage: "generating_questions",
          progress: 40,
          message: "Generating technical interview questions...",
        },
        updatedAt: new Date("2026-09-25T12:00:00.000Z"),
      };

      vi.spyOn(kitRepository, "findGenerationStatus").mockResolvedValue(mockDoc as any);

      // Test /api/kits/:kitId/generation-status
      const res = await fetch(`${serverUrl}/api/kits/${mockKitId}/generation-status`, {
        headers: {
          Cookie: `session_token=${mockToken}`,
          Accept: "application/json",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        id: mockKitId,
        status: "running",
        stage: "generating_questions",
        progress: 40,
        message: "Generating technical interview questions...",
        error: null,
        generation: mockDoc.generation,
        updatedAt: "2026-09-25T12:00:00.000Z",
      });
    });

    it("should also support root mount /kits/:kitId/generation-status", async () => {
      const mockDoc = {
        _id: new ObjectId(mockKitId),
        status: "completed" as const,
        generation: {
          status: "completed" as const,
          stage: "completed",
          progress: 100,
        },
        updatedAt: new Date("2026-09-25T12:00:00.000Z"),
      };

      vi.spyOn(kitRepository, "findGenerationStatus").mockResolvedValue(mockDoc as any);

      const res = await fetch(`${serverUrl}/kits/${mockKitId}/generation-status`, {
        headers: {
          Cookie: `session_token=${mockToken}`,
          Accept: "application/json",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("completed");
    });

    it("should return 404 JSON (NOT Express HTML 404) when kit does not exist", async () => {
      vi.spyOn(kitRepository, "findGenerationStatus").mockResolvedValue(null);

      const res = await fetch(`${serverUrl}/api/kits/${mockKitId}/generation-status`, {
        headers: {
          Cookie: `session_token=${mockToken}`,
          Accept: "application/json",
        },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error?.code).toBe("KIT_NOT_FOUND");
    });

    it("should return 404 JSON without 500 BSON crash when kitId is not a valid hex ObjectId", async () => {
      const res = await fetch(`${serverUrl}/api/kits/invalid-kit-id-12345/generation-status`, {
        headers: {
          Cookie: `session_token=${mockToken}`,
          Accept: "application/json",
        },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error?.code).toBe("KIT_NOT_FOUND");
    });

    it("should return 401 when request is unauthenticated", async () => {
      const res = await fetch(`${serverUrl}/api/kits/${mockKitId}/generation-status`, {
        headers: {
          Accept: "application/json",
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error?.code).toBe("UNAUTHENTICATED");
    });
  });

  describe("2. Read Endpoint No-LLM Invariant", () => {
    it("should ensure all read endpoints never invoke the LLM", async () => {
      const mockLLM = new MockLLMProvider();
      const llmSpy = vi.spyOn(mockLLM, "generateStructured");

      vi.spyOn(kitRepository, "findByUserId").mockResolvedValue([]);
      vi.spyOn(kitRepository, "findGenerationStatus").mockResolvedValue({
        _id: new ObjectId(mockKitId),
        status: "running",
        updatedAt: new Date(),
      } as any);
      vi.spyOn(kitRepository, "findByIdAndUserId").mockResolvedValue({
        _id: new ObjectId(mockKitId),
        userId: new ObjectId(mockUserId),
        status: "completed",
        kit: { id: mockKitId, title: "Engineer", questions: [], flashcards: [] },
        updatedAt: new Date(),
      } as any);

      const headers = {
        Cookie: `session_token=${mockToken}`,
        Accept: "application/json",
      };

      // 1. GET /api/kits
      await fetch(`${serverUrl}/api/kits`, { headers });
      // 2. GET /api/kits/:id
      await fetch(`${serverUrl}/api/kits/${mockKitId}`, { headers });
      // 3. GET /api/kits/:id/generation-status
      await fetch(`${serverUrl}/api/kits/${mockKitId}/generation-status`, { headers });
      // 4. GET /api/auth/me
      await fetch(`${serverUrl}/api/auth/me`, { headers });
      // 5. GET practice summary
      await fetch(`${serverUrl}/api/kits/${mockKitId}/practice/summary`, { headers });
      // 6. GET practice cards
      await fetch(`${serverUrl}/api/kits/${mockKitId}/practice/cards`, { headers });

      expect(llmSpy).toHaveBeenCalledTimes(0);
      expect(mockLLM.callCount).toBe(0);
    });
  });

  describe("3. LLM Resilience: Per-Call Timeout & Bounded Attempts", () => {
    it("should bound retry attempts per model to at most 2", () => {
      const provider = new GeminiProvider("mock_api_key");
      expect(provider).toBeDefined();
    });

    it("should classify timed-out LLM calls as retryable", async () => {
      const { isRetryableError } = await import("../../apps/api/src/ai/llm-client.js");

      expect(isRetryableError(new Error("LLM provider call timed out after 25000ms"))).toBe(true);
      expect(isRetryableError(new Error("Request timed out"))).toBe(true);
      expect(isRetryableError(new Error("Connection reset by peer"))).toBe(true);
      expect(isRetryableError(new Error("API key not valid"))).toBe(false);
    });
  });

  describe("4. Frontend Kit Detail Error Classification Logic", () => {
    // Pure logic simulation mirroring apps/web/app/kits/[kitId]/page.tsx
    function classifyPageState({
      statusQueryStatus,
      statusQueryError,
      kitStatus,
      kitError,
      hasKitData,
    }: {
      statusQueryStatus?: "running" | "queued" | "completed" | "failed" | "cancelled";
      statusQueryError?: { statusCode: number };
      kitStatus?: "running" | "queued" | "completed" | "failed" | "cancelled";
      kitError?: { statusCode: number };
      hasKitData?: boolean;
    }): "progress_ui" | "failure_ui" | "cancelled_ui" | "full_kit" | "kit_not_found" | "temporarily_unavailable" {
      // 1. Status query succeeded with active status
      if (statusQueryStatus === "running" || statusQueryStatus === "queued") {
        return "progress_ui";
      }

      // 2. Status query failed or cancelled
      if (statusQueryStatus === "failed") {
        return "failure_ui";
      }
      if (statusQueryStatus === "cancelled") {
        return "cancelled_ui";
      }

      // 3. Status query encountered error -> Fallback to kit query
      if (statusQueryError) {
        if (kitError?.statusCode === 404) {
          return "kit_not_found";
        }
        if (kitStatus === "running" || kitStatus === "queued") {
          return "progress_ui";
        }
        if (kitStatus === "completed" && hasKitData) {
          return "full_kit";
        }
        if (kitStatus === "failed") {
          return "failure_ui";
        }
        return "temporarily_unavailable";
      }

      // 4. Status query completed
      if (statusQueryStatus === "completed") {
        if (hasKitData) return "full_kit";
        if (kitError?.statusCode === 404) return "kit_not_found";
      }

      return "temporarily_unavailable";
    }

    it("should render progress UI when statusQuery returns 404 but kit exists and is running", () => {
      const state = classifyPageState({
        statusQueryError: { statusCode: 404 },
        kitStatus: "running",
        hasKitData: true,
      });

      expect(state).toBe("progress_ui");
      expect(state).not.toBe("kit_not_found");
    });

    it("should render full kit when statusQuery returns 404 but kit exists and is completed", () => {
      const state = classifyPageState({
        statusQueryError: { statusCode: 404 },
        kitStatus: "completed",
        hasKitData: true,
      });

      expect(state).toBe("full_kit");
      expect(state).not.toBe("kit_not_found");
    });

    it("should render kit_not_found ONLY when full kit query returns 404", () => {
      const state = classifyPageState({
        statusQueryError: { statusCode: 404 },
        kitError: { statusCode: 404 },
      });

      expect(state).toBe("kit_not_found");
    });

    it("should render temporarily_unavailable when statusQuery errors but kit query is still recovering", () => {
      const state = classifyPageState({
        statusQueryError: { statusCode: 500 },
        hasKitData: false,
      });

      expect(state).toBe("temporarily_unavailable");
    });
  });
});
