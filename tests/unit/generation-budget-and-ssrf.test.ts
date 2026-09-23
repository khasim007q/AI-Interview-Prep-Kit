import { describe, it, expect, vi } from "vitest";
import { runGenerationPipeline } from "../../apps/api/src/pipeline/orchestrator.js";
import { MockLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import { fetchWebPage } from "../../apps/api/src/research/page-fetcher.js";
import { isUrlAllowedByRobots } from "../../apps/api/src/research/robots.js";
import { kitService } from "../../apps/api/src/services/kit.service.js";
import { kitRepository } from "../../apps/api/src/repositories/kit.repository.js";
import { ObjectId } from "mongodb";

describe("Generation Budget & Deadline Control", () => {
  it("should abort generation when deadline is exceeded", async () => {
    const mockLLM = new MockLLMProvider();

    // Mock requirement extraction with a delay longer than deadline
    const originalGenerate = mockLLM.generateStructured.bind(mockLLM);
    mockLLM.generateStructured = vi.fn(async (request, schema, context) => {
      // Simulate slow LLM call
      await new Promise((r) => setTimeout(r, 60));
      return originalGenerate(request, schema, context);
    });

    mockLLM.setMockResponse("Analyze the following job description and extract", {
      title: "Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Code"],
      requirements: [{ id: "r1", text: "Go", kind: "technical", priority: "must" }],
    });

    // Pass an aggressive 20ms deadline
    await expect(
      runGenerationPipeline(
        {
          jd: "Hiring Senior Go Backend Engineer.",
          company_url: "https://example.com",
          days: 3,
        },
        {
          llmProvider: mockLLM,
          maxGenerationTimeMs: 20, // 20ms deadline
        }
      )
    ).rejects.toMatchObject({
      statusCode: 504,
      code: "GENERATION_TIMEOUT",
    });
  });

  it("should enforce maximum LLM call budget per generation", async () => {
    const mockLLM = new MockLLMProvider();

    mockLLM.setMockResponse("Analyze the following job description and extract", {
      title: "Backend Engineer",
      seniority: "Mid",
      responsibilities: [],
      requirements: [{ id: "r1", text: "Python", kind: "technical", priority: "must" }],
    });

    // Set maxLlmCalls to 1 (only allows requirement extraction, then blocks brief/questions)
    await expect(
      runGenerationPipeline(
        {
          jd: "Hiring Python Engineer.",
          company_url: "https://example.com",
          days: 3,
        },
        {
          llmProvider: mockLLM,
          maxLlmCalls: 1,
        }
      )
    ).rejects.toMatchObject({
      code: "LLM_CALL_BUDGET_EXCEEDED",
    });
  });
});

describe("Crawler SSRF & Redirect Protection", () => {
  it("should reject redirects to localhost and private/metadata addresses", async () => {
    // Test each forbidden destination URL
    const forbiddenRedirects = [
      "http://127.0.0.1:8080/admin",
      "http://localhost/secret",
      "http://10.0.0.1/private",
      "http://172.16.0.1/internal",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ];

    for (const target of forbiddenRedirects) {
      const res = await fetchWebPage(target, { allowLocalFetch: false });
      expect(res.ok).toBe(false);
      expect(res.status === 400 || res.status === 403).toBe(true);
    }
  });

  it("should reject HTTP redirects (301/302) pointing to private or metadata addresses", async () => {
    const originalFetch = globalThis.fetch;
    const forbiddenLocations = [
      "http://127.0.0.1:8080/admin",
      "http://localhost/secret",
      "http://10.0.0.1/private",
      "http://172.16.0.1/internal",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ];

    for (const forbiddenTarget of forbiddenLocations) {
      globalThis.fetch = vi.fn(async (url: any) => {
        if (typeof url === "string" && url.includes("public-site.com")) {
          return new Response(null, {
            status: 302,
            headers: { Location: forbiddenTarget },
          });
        }
        return originalFetch(url);
      });

      try {
        const res = await fetchWebPage("https://public-site.com/redirect-me", {
          allowLocalFetch: false,
        });
        expect(res.ok).toBe(false);
        expect(res.status === 400 || res.status === 403).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  it("should reject robots.txt check for private or metadata targets", async () => {
    expect(await isUrlAllowedByRobots("http://127.0.0.1:4000/robots.txt", false)).toBe(false);
    expect(await isUrlAllowedByRobots("http://169.254.169.254/robots.txt", false)).toBe(false);
    expect(await isUrlAllowedByRobots("http://metadata.google.internal/robots.txt", false)).toBe(false);
  });
});

describe("Duplicate Active Generation Prevention", () => {
  it("should return existing active job when concurrent race condition triggers E11000", async () => {
    const existingActiveDoc = {
      _id: new ObjectId(),
      userId: new ObjectId(),
      status: "running" as const,
      input: { jd: "Senior Dev", company_url: "https://example.com", days: 3 },
      inputHash: "test_hash",
      kit: null,
      generation: { status: "running" as const, stage: "starting", progress: 10 },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // First call to findActiveOrCompleted returns null (simulating concurrent race)
    const findSpy = vi
      .spyOn(kitRepository, "findActiveOrCompleted")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingActiveDoc as any);

    // create throws E11000 duplicate key error
    const duplicateKeyError = new Error("E11000 duplicate key error collection: kits index: userId_1_inputHash_1");
    (duplicateKeyError as any).code = 11000;
    const createSpy = vi.spyOn(kitRepository, "create").mockRejectedValue(duplicateKeyError);

    try {
      const result = await kitService.createKitJob(
        existingActiveDoc.userId.toString(),
        {
          jd: "Senior Dev",
          company_url: "https://example.com",
          days: 3,
        }
      );

      // Verify it safely returned the active job without crashing or creating duplicate
      expect(result._id).toEqual(existingActiveDoc._id);
      expect(result.status).toBe("running");
    } finally {
      findSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});
