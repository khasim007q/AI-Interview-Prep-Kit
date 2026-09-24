import { describe, it, expect, vi } from "vitest";
import { createLimiter } from "../../apps/api/src/utils/limiter.js";
import { MockLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import { runGenerationPipeline } from "../../apps/api/src/pipeline/orchestrator.js";
import type { QuestionCategory } from "@ai-interview-prep/shared";

describe("Concurrency - Bounded Limiter", () => {
  it("should never exceed max concurrent tasks", async () => {
    const limiter = createLimiter(2);
    let activeTasks = 0;
    let maxSeenActive = 0;

    const task = async (id: number) => {
      return limiter(async () => {
        activeTasks++;
        if (activeTasks > maxSeenActive) {
          maxSeenActive = activeTasks;
        }
        await new Promise((r) => setTimeout(r, 20));
        activeTasks--;
        return id;
      });
    };

    const results = await Promise.all([task(1), task(2), task(3), task(4), task(5)]);

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxSeenActive).toBeLessThanOrEqual(2);
    expect(activeTasks).toBe(0);
  });

  it("should reject invalid concurrency < 1", () => {
    expect(() => createLimiter(0)).toThrow();
    expect(() => createLimiter(-1)).toThrow();
  });
});

describe("Concurrency - Deterministic Category Merging", () => {
  it("should maintain canonical category ordering even if execution completes out of order", async () => {
    const mockLLM = new MockLLMProvider();

    // Mock requirements extraction
    mockLLM.setMockResponse("Analyze the following job description and extract", {
      title: "Fullstack Engineer",
      seniority: "Mid",
      responsibilities: ["Develop features"],
      requirements: [
        { id: "r1", text: "React and Node.js", kind: "technical", priority: "must" },
        { id: "r2", text: "System scalability", kind: "technical", priority: "must" },
        { id: "r3", text: "Teamwork", kind: "behavioural", priority: "nice" },
      ],
    });

    // Mock company brief
    mockLLM.setMockResponse("Synthesize an interview preparation company brief", {
      summary: "Acme Corp builds web systems.",
      what_they_do: "Software development.",
      sources: ["https://example.com"],
    });

    // Mock questions: introduce artificial delays so behavioural finishes first and technical finishes last
    const originalGenerate = mockLLM.generateStructured.bind(mockLLM);
    mockLLM.generateStructured = vi.fn(async (request, schema, context) => {
      const isTech =
        request.systemInstruction?.includes("technical") ||
        request.prompt.includes('"technical"');
      const isSys =
        request.systemInstruction?.includes("system-design") ||
        request.prompt.includes('"system-design"');
      const isBeh =
        request.systemInstruction?.includes("behavioural") ||
        request.prompt.includes('"behavioural"');
      const isFit =
        request.systemInstruction?.includes("company-fit") ||
        request.prompt.includes('"company-fit"');

      if (isTech) {
        // Delay technical by 60ms
        await new Promise((r) => setTimeout(r, 60));
        return schema.parse({
          questions: [
            {
              id: "temp_tech",
              requirement_ids: ["r1"],
              category: "technical",
              prompt: "Explain event loop in Node.js.",
              answer_outline: "Call stack, event loop, libuv, task queue.",
              difficulty: 2,
            },
          ],
        });
      }

      if (isSys) {
        // Delay system design by 40ms
        await new Promise((r) => setTimeout(r, 40));
        return schema.parse({
          questions: [
            {
              id: "temp_sys",
              requirement_ids: ["r2"],
              category: "system-design",
              prompt: "Design a notification service.",
              answer_outline: "Message queue, workers, delivery providers.",
              difficulty: 3,
            },
          ],
        });
      }

      if (isBeh) {
        // Finishes quickly in 5ms
        await new Promise((r) => setTimeout(r, 5));
        return schema.parse({
          questions: [
            {
              id: "temp_beh",
              requirement_ids: ["r3"],
              category: "behavioural",
              prompt: "Tell me about a conflict with a teammate.",
              answer_outline: "Situation, discussion, resolution.",
              difficulty: 1,
            },
          ],
        });
      }

      if (isFit) {
        // Finishes quickly in 10ms
        await new Promise((r) => setTimeout(r, 10));
        return schema.parse({
          questions: [
            {
              id: "temp_fit",
              requirement_ids: ["r1"],
              category: "company-fit",
              prompt: "Why work at Acme?",
              answer_outline: "Mission alignment.",
              difficulty: 1,
            },
          ],
        });
      }

      return originalGenerate(request, schema, context);
    });

    const kit = await runGenerationPipeline(
      {
        jd: "Hiring Fullstack Engineer with React and Node.js experience.",
        company_url: "https://example.com",
        days: 3,
      },
      {
        llmProvider: mockLLM,
        llmConcurrency: 2,
      }
    );

    // Verify questions categories are strictly in canonical order:
    // "technical" -> "system-design" -> "behavioural" -> "company-fit"
    const categoriesFound = kit.questions.map((q) => q.category);
    expect(categoriesFound).toEqual([
      "technical",
      "system-design",
      "behavioural",
      "company-fit",
    ]);

    // Verify deterministic question IDs: q1, q2, q3, q4
    expect(kit.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
  }, 15000);
});
