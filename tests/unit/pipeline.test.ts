import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import { runGenerationPipeline } from "../../apps/api/src/pipeline/orchestrator.js";
import { validateKitStructure } from "../../apps/api/src/deterministic/structure-validator.js";

describe("Pipeline Orchestrator & LLM Adapter", () => {
  it("should execute full staged pipeline and generate a valid canonical kit", async () => {
    const mockLLM = new MockLLMProvider();

    // 1. Mock requirement extraction
    mockLLM.setMockResponse("Analyze the following job description and extract", {
      title: "Senior Backend Engineer",
      seniority: "Senior",
      responsibilities: [
        "Design scalable microservices architecture",
        "Lead database performance optimization",
        "Mentor junior and mid-level engineers",
      ],
      requirements: [
        {
          id: "r1",
          text: "5+ years backend engineering with Node.js or Go",
          kind: "technical",
          priority: "must",
        },
        {
          id: "r2",
          text: "Hands-on experience with MongoDB and Redis caching",
          kind: "technical",
          priority: "must",
        },
        {
          id: "r3",
          text: "Experience leading technical design and mentoring",
          kind: "behavioural",
          priority: "nice",
        },
      ],
    });

    // 2. Mock company brief
    mockLLM.setMockResponse("Synthesize an interview preparation company brief", {
      summary: "Acme Corp is a high-growth cloud developer tooling enterprise.",
      what_they_do: "Cloud infrastructure management and developer velocity platforms.",
      sources: ["https://example.com/about"],
    });

    // 3. Mock technical category questions
    mockLLM.setMockResponse("technical loops", {
      questions: [
        {
          id: "q1",
          requirement_ids: ["r1"],
          category: "technical",
          prompt: "How do you handle backpressure in high-throughput Node.js streams?",
          answer_outline: "Explain stream.pipeline, pause/resume, highWaterMark, and drain event.",
          difficulty: 3,
        },
      ],
    });

    // 4. Mock system-design questions
    mockLLM.setMockResponse("system-design loops", {
      questions: [
        {
          id: "q2",
          requirement_ids: ["r2"],
          category: "system-design",
          prompt: "Design a distributed caching architecture using Redis and MongoDB with write-behind.",
          answer_outline: "Discuss cache-aside vs write-behind, cache invalidation, and race conditions.",
          difficulty: 2,
        },
      ],
    });

    // 5. Mock behavioural questions
    mockLLM.setMockResponse("behavioural loops", {
      questions: [
        {
          id: "q3",
          requirement_ids: ["r3"],
          category: "behavioural",
          prompt: "Tell me about a technical decision you made that received pushback from the team.",
          answer_outline: "STAR format: situation, differing perspectives, consensus-building, outcome.",
          difficulty: 1,
        },
      ],
    });

    // 6. Mock company-fit questions
    mockLLM.setMockResponse("company-fit loops", {
      questions: [
        {
          id: "q4",
          requirement_ids: ["r1"],
          category: "company-fit",
          prompt: "Why are you interested in developer velocity tooling at Acme?",
          answer_outline: "Connect personal passion for developer efficiency with Acme's mission.",
          difficulty: 1,
        },
      ],
    });

    // 7. Mock flashcards
    mockLLM.setMockResponse("active recall for high-stakes technical interviews", {
      flashcards: [
        {
          id: "f1",
          front: "What is backpressure in stream processing?",
          back: "A mechanism that slows down the producer when the consumer is overwhelmed.",
          requirement_ids: ["r1"],
        },
        {
          id: "f2",
          front: "What is the cache-aside pattern?",
          back: "Application reads from cache first; on miss, reads from DB and writes to cache.",
          requirement_ids: ["r2"],
        },
      ],
    });

    const progressLogs: { stage: string; progress: number }[] = [];

    const kit = await runGenerationPipeline(
      {
        jd: `
          Senior Backend Engineer
          We are seeking a Senior Backend Engineer to design scalable microservices and mentor engineers.
          Requirements:
          - 5+ years backend engineering with Node.js or Go (must have)
          - Hands-on experience with MongoDB and Redis caching (required)
          - Experience leading technical design and mentoring (nice to have)
        `,
        company_url: "https://example.com",
        days: 3,
      },
      {
        llmProvider: mockLLM,
        onProgress: (stage, progress) => {
          progressLogs.push({ stage, progress });
        },
      }
    );

    // Verify progress tracking
    expect(progressLogs.length).toBeGreaterThan(5);
    expect(progressLogs[progressLogs.length - 1].progress).toBe(100);

    // Verify kit shape & contents
    expect(kit.source.company).toBeDefined();
    expect(kit.source.jd_chars).toBeGreaterThan(100);
    expect(kit.role.title).toBe("Senior Backend Engineer");
    expect(kit.questions.length).toBeGreaterThanOrEqual(3);
    expect(kit.flashcards.length).toBeGreaterThanOrEqual(1);

    // Verify schedule allocation
    expect(kit.schedule.days_available).toBe(3);
    expect(kit.schedule.days).toHaveLength(3);

    // Verify deterministic structure validation passes
    const validation = validateKitStructure(kit, { requireMustCoverage: true });
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  }, 15000);
});
