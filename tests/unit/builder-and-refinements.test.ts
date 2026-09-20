import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "../../apps/api/src/ai/llm-client.js";
import { runGenerationPipeline } from "../../apps/api/src/pipeline/orchestrator.js";
import { validateKitStructure } from "../../apps/api/src/deterministic/structure-validator.js";
import { checkRequirementCoverage } from "../../apps/api/src/deterministic/coverage-checker.js";
import { allocateSchedule } from "../../apps/api/src/deterministic/scheduler.js";
import type { Kit, Question, Requirement } from "@ai-interview-prep/shared";

describe("P0: 2-Line Minimal JD Handling", () => {
  it("should process a 2-line JD (< 50 chars) without rejection and create a valid kit", async () => {
    const mockLLM = new MockLLMProvider();

    // Mock requirement extraction returning 0 explicit requirements for short JD
    mockLLM.setMockResponse("Analyze the following job description and extract", {
      title: "Backend Engineer",
      seniority: "Mid",
      responsibilities: [],
      requirements: [],
    });

    // Mock brief
    mockLLM.setMockResponse("Synthesize an interview preparation company brief", {
      summary: "Acme is a software agency.",
      what_they_do: "Web and backend development.",
      sources: ["https://example.com"],
    });

    // Mock questions
    mockLLM.setMockResponse("technical loops", {
      questions: [
        {
          id: "q1",
          requirement_ids: [],
          category: "technical",
          prompt: "Explain how you optimize database queries.",
          answer_outline: "Indexing, query analysis, caching, schema design.",
          difficulty: 2,
        },
      ],
    });

    // Run pipeline with a 38-character 2-line JD
    const twoLineJd = "Hiring Backend Engineer.\nSend resume.";
    expect(twoLineJd.length).toBeLessThan(50);

    const kit = await runGenerationPipeline(
      {
        jd: twoLineJd,
        company_url: "https://example.com",
        days: 3,
      },
      { llmProvider: mockLLM }
    );

    expect(kit).toBeDefined();
    expect(kit.source.jd_chars).toBe(twoLineJd.trim().length);
    expect(kit.questions.length).toBeGreaterThan(0);
    expect(kit.schedule.days_available).toBe(3);
    expect(kit.schedule.days.length).toBe(3);

    // Structure validation must succeed
    const validation = validateKitStructure(kit, { requireMustCoverage: true });
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe("P0: Must-Have Coverage Gate", () => {
  it("should fail validation if a must-have requirement is uncovered", () => {
    const requirements: Requirement[] = [
      { id: "r1", text: "Python", kind: "technical", priority: "must" },
      { id: "r2", text: "Docker", kind: "technical", priority: "must" },
    ];

    // Only r1 is covered
    const questions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Python question",
        answer_outline: "Answer",
        difficulty: 2,
      },
    ];

    const coverage = checkRequirementCoverage(requirements, questions);
    expect(coverage.isMustCovered).toBe(false);
    expect(coverage.mustUncoveredRequirementIds).toContain("r2");

    const testKit: Partial<Kit> = {
      source: {
        company: "Test",
        company_url: "https://example.com",
        role: "Dev",
        location: "",
        jd_chars: 100,
        researched_at: new Date().toISOString(),
        pages_used: ["https://example.com"],
      },
      company_brief: { summary: "Brief", what_they_do: "Work", sources: [] },
      role: { title: "Dev", seniority: "Mid", responsibilities: [], requirements },
      questions,
      flashcards: [{ id: "f1", front: "F", back: "B", requirement_ids: ["r1"] }],
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: "Python", question_ids: ["q1"], minutes: 30 }],
      },
      coverage: {
        uncovered_requirement_ids: ["r2"],
        passes: 1,
      },
    };

    // When requireMustCoverage is true, it must fail with an error for r2
    const validation = validateKitStructure(testKit as Kit, { requireMustCoverage: true });
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes("Must-have requirement 'r2' is not covered"))).toBe(true);
  });
});

describe("P0: Edited Question & Section Preservation", () => {
  it("should preserve edited and pinned questions in category", () => {
    const existingQuestions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Original question",
        answer_outline: "Original answer",
        difficulty: 2,
        metadata: {
          origin: "user",
          edited: true,
          pinned: false,
          state: "active",
          revision: 1,
        },
      },
      {
        id: "q2",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Pinned question",
        answer_outline: "Answer",
        difficulty: 1,
        metadata: {
          origin: "generated",
          edited: false,
          pinned: true,
          state: "active",
          revision: 0,
        },
      },
      {
        id: "q3",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Untouched generated question",
        answer_outline: "Answer",
        difficulty: 2,
        metadata: {
          origin: "generated",
          edited: false,
          pinned: false,
          state: "active",
          revision: 0,
        },
      },
    ];

    // Preservation filter rule: pinned === true || edited === true || origin === "user"
    const preserved = existingQuestions.filter(
      (q) => q.metadata?.pinned || q.metadata?.edited || q.metadata?.origin === "user"
    );

    expect(preserved).toHaveLength(2);
    expect(preserved.map((q) => q.id)).toEqual(["q1", "q2"]);
  });
});

describe("P0/P1: Schedule Recalculation on Question Mutations", () => {
  it("should update schedule question allocation when a new question is added", () => {
    const requirements: Requirement[] = [
      { id: "r1", text: "React", kind: "technical", priority: "must" },
      { id: "r2", text: "TypeScript", kind: "technical", priority: "must" },
    ];

    const questions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "React question",
        answer_outline: "Answer",
        difficulty: 2,
      },
    ];

    const initialSchedule = allocateSchedule(2, questions, requirements);
    expect(initialSchedule.days[0].question_ids).toContain("q1");

    // Add a second question
    const updatedQuestions: Question[] = [
      ...questions,
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "technical",
        prompt: "TypeScript question",
        answer_outline: "Answer",
        difficulty: 3,
      },
    ];

    const updatedSchedule = allocateSchedule(2, updatedQuestions, requirements);
    const allScheduledIds = updatedSchedule.days.flatMap((d) => d.question_ids);
    expect(allScheduledIds).toContain("q1");
    expect(allScheduledIds).toContain("q2");
  });
});
