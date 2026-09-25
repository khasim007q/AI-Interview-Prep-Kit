import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MockLLMProvider, defaultLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import {
  runGenerationPipeline,
  globalPipelineLlmLimiter,
} from "../../apps/api/src/pipeline/orchestrator.js";
import { kitService } from "../../apps/api/src/services/kit.service.js";
import { kitRepository } from "../../apps/api/src/repositories/kit.repository.js";
import { ObjectId } from "mongodb";

describe("Production Hardening Pass 2 - Targeted Verifications", () => {
  describe("Item 1 & 2: Configuration & Deployment Integrity", () => {
    it("should configure render.yaml with Gemini 3.6/3.5 and no 2.0 references", () => {
      const renderYamlPath = path.resolve(process.cwd(), "render.yaml");
      const content = fs.readFileSync(renderYamlPath, "utf-8");

      expect(content).toContain("gemini-3.6-flash");
      expect(content).toContain("gemini-3.5-flash");
      expect(content).not.toContain("gemini-2.0-flash");
    });
  });

  describe("Item 3: Requirement Mapping Integrity", () => {
    it("should filter out invalid requirement IDs without falling back to requirements[0]", async () => {
      const mockLLM = new MockLLMProvider();

      mockLLM.setMockResponse("Analyze the following job description and extract", {
        title: "Frontend Engineer",
        seniority: "Mid",
        responsibilities: ["Build UI components"],
        requirements: [
          { id: "r1", text: "React experience", kind: "technical", priority: "must" },
          { id: "r2", text: "TypeScript experience", kind: "technical", priority: "must" },
        ],
      });

      mockLLM.setMockResponse("Synthesize an interview preparation company brief", {
        summary: "Web company",
        what_they_do: "Web development",
        sources: ["https://example.com"],
      });

      // Mock questions generator returning hallucinated requirement ID "r999_hallucinated"
      const originalGenerate = mockLLM.generateStructured.bind(mockLLM);
      mockLLM.generateStructured = vi.fn(async (request, schema, context) => {
        if (
          request.systemInstruction?.includes("technical") ||
          request.prompt.includes('"technical"')
        ) {
          return schema.parse({
            questions: [
              {
                id: "temp_q1",
                requirement_ids: ["r999_hallucinated"],
                category: "technical",
                prompt: "Tell me about state machines.",
                answer_outline: "State charts, transitions, deterministic outputs.",
                difficulty: 2,
              },
              {
                id: "temp_q2",
                requirement_ids: ["r2"],
                category: "technical",
                prompt: "Explain TypeScript generics.",
                answer_outline: "Type parameters, constraints, conditional types.",
                difficulty: 2,
              },
            ],
          });
        }

        // Targeted second pass covers r1
        if (request.prompt.includes("Targeted Question Generation")) {
          return schema.parse({
            questions: [
              {
                id: "temp_target_q",
                requirement_ids: ["r1"],
                category: "technical",
                prompt: "Explain React useEffect dependency array.",
                answer_outline: "Referential equality, closure captures, cleanup functions.",
                difficulty: 2,
              },
            ],
          });
        }

        return originalGenerate(request, schema, context);
      });

      const kit = await runGenerationPipeline(
        {
          jd: "Hiring Mid Frontend Engineer with React and TypeScript experience.",
          company_url: "https://example.com",
          days: 3,
        },
        {
          llmProvider: mockLLM,
          llmConcurrency: 2,
        }
      );

      // Verify that question with r999_hallucinated has empty requirement_ids array
      // and was NOT falsely rewritten to ["r1"]!
      const stateMachineQuestion = kit.questions.find((q) =>
        q.prompt.includes("state machines")
      );
      expect(stateMachineQuestion).toBeDefined();
      expect(stateMachineQuestion!.requirement_ids).toEqual([]);
      expect(stateMachineQuestion!.requirement_ids).not.toContain("r1");
    }, 15000);
  });

  describe("Item 4: Global LLM Limiter", () => {
    it("should export and enforce bounded concurrency on the global process limiter", async () => {
      expect(globalPipelineLlmLimiter).toBeDefined();

      let activeCalls = 0;
      let maxConcurrentObserved = 0;

      const mockOperation = async (id: number) => {
        return globalPipelineLlmLimiter(async () => {
          activeCalls++;
          if (activeCalls > maxConcurrentObserved) {
            maxConcurrentObserved = activeCalls;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
          activeCalls--;
          return id;
        });
      };

      const tasks = [1, 2, 3, 4, 5].map((id) => mockOperation(id));
      const results = await Promise.all(tasks);

      expect(results).toEqual([1, 2, 3, 4, 5]);
      expect(maxConcurrentObserved).toBeLessThanOrEqual(2);
      expect(activeCalls).toBe(0);
    });
  });

  describe("Item 5: Generation Cancellation & In-Flight Abort", () => {
    it("should immediately abort in-flight LLM call when signal is aborted", async () => {
      const mockLLM = new MockLLMProvider();
      const controller = new AbortController();

      controller.abort(); // already aborted

      await expect(
        mockLLM.generateStructured(
          { prompt: "Test prompt" },
          {} as any,
          { signal: controller.signal }
        )
      ).rejects.toMatchObject({
        code: "GENERATION_CANCELLED",
      });
    });

    it("should abort runGenerationPipeline immediately when signal is triggered", async () => {
      const mockLLM = new MockLLMProvider();
      const controller = new AbortController();

      mockLLM.setMockResponse("Analyze the following job description and extract", {
        title: "Software Engineer",
        seniority: "Junior",
        responsibilities: [],
        requirements: [{ id: "r1", text: "Coding", kind: "technical", priority: "must" }],
      });

      // Abort signal
      controller.abort();

      await expect(
        runGenerationPipeline(
          {
            jd: "Looking for Junior Developer.",
            company_url: "https://example.com",
            days: 3,
          },
          {
            llmProvider: mockLLM,
            signal: controller.signal,
          }
        )
      ).rejects.toMatchObject({
        code: "GENERATION_CANCELLED",
      });
    }, 15000);

    it("should cancel active generation and update kit status to cancelled", async () => {
      const userId = new ObjectId().toString();
      const kitId = new ObjectId().toString();

      // Mock repository methods
      const mockKitDoc = {
        _id: new ObjectId(kitId),
        userId: new ObjectId(userId),
        status: "running" as const,
        input: { jd: "Senior Go Engineer", company_url: "https://example.com", days: 3 },
        inputHash: "hash123",
        kit: null,
        generation: {
          status: "running" as const,
          stage: "extracting_requirements",
          progress: 15,
        },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(kitRepository, "findByIdAndUserId").mockResolvedValue(mockKitDoc as any);
      vi.spyOn(kitRepository, "findById").mockResolvedValue({
        ...mockKitDoc,
        status: "cancelled",
        generation: {
          status: "cancelled",
          stage: "failed",
          progress: 0,
          message: "Generation cancelled by user",
        },
      } as any);
      const updateSpy = vi.spyOn(kitRepository, "updateGenerationProgress").mockResolvedValue(true);

      const result = await kitService.cancelKitGeneration(kitId, userId);

      expect(result.status).toBe("cancelled");
      expect(updateSpy).toHaveBeenCalledWith(
        mockKitDoc._id,
        expect.objectContaining({
          status: "cancelled",
        })
      );
    });
  });
});
