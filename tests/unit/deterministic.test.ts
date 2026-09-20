import { describe, it, expect } from "vitest";
import type { Requirement, Question, Kit } from "@ai-interview-prep/shared";
import { normalizeJobDescription } from "../../apps/api/src/deterministic/jd-normalizer.js";
import { checkRequirementCoverage } from "../../apps/api/src/deterministic/coverage-checker.js";
import { allocateSchedule } from "../../apps/api/src/deterministic/scheduler.js";
import { validateKitStructure } from "../../apps/api/src/deterministic/structure-validator.js";

describe("Deterministic JD Normalizer", () => {
  it("should handle empty and whitespace-only strings", () => {
    expect(normalizeJobDescription("")).toEqual({
      text: "",
      charCount: 0,
      wordCount: 0,
    });
    expect(normalizeJobDescription("   \n\t   ")).toEqual({
      text: "",
      charCount: 0,
      wordCount: 0,
    });
  });

  it("should normalize line breaks and collapse excessive blank lines", () => {
    const raw = "Line 1\r\n\r\n\r\n\r\nLine 2   \r\nLine 3";
    const result = normalizeJobDescription(raw);
    expect(result.text).toBe("Line 1\n\nLine 2\nLine 3");
    expect(result.charCount).toBe(result.text.length);
    expect(result.wordCount).toBe(6);
  });

  it("should remove zero-width spaces and control characters", () => {
    const raw = "Senior\u200B Developer\uFEFF at Acme";
    const result = normalizeJobDescription(raw);
    expect(result.text).toBe("Senior Developer at Acme");
  });
});

describe("Deterministic Coverage Checker", () => {
  const reqs: Requirement[] = [
    { id: "r1", text: "React experience", kind: "technical", priority: "must" },
    { id: "r2", text: "Node.js experience", kind: "technical", priority: "must" },
    { id: "r3", text: "Docker knowledge", kind: "technical", priority: "nice" },
  ];

  it("should identify full coverage when all requirements have questions", () => {
    const questions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1", "r2"],
        category: "technical",
        prompt: "P1",
        answer_outline: "A1",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r3"],
        category: "technical",
        prompt: "P2",
        answer_outline: "A2",
        difficulty: 1,
      },
    ];

    const result = checkRequirementCoverage(reqs, questions);
    expect(result.isFullyCovered).toBe(true);
    expect(result.isMustCovered).toBe(true);
    expect(result.uncoveredRequirementIds).toHaveLength(0);
    expect(result.mustUncoveredRequirementIds).toHaveLength(0);
    expect(result.coverageRatio).toBe(1.0);
  });

  it("should identify when a must-have requirement is missing", () => {
    const questions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "P1",
        answer_outline: "A1",
        difficulty: 2,
      },
    ];

    const result = checkRequirementCoverage(reqs, questions);
    expect(result.isFullyCovered).toBe(false);
    expect(result.isMustCovered).toBe(false);
    expect(result.uncoveredRequirementIds).toEqual(["r2", "r3"]);
    expect(result.mustUncoveredRequirementIds).toEqual(["r2"]);
    expect(result.coveredRequirementIds).toEqual(["r1"]);
  });

  it("should identify when only nice-to-have requirements are missing", () => {
    const questions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "P1",
        answer_outline: "A1",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "technical",
        prompt: "P2",
        answer_outline: "A2",
        difficulty: 2,
      },
    ];

    const result = checkRequirementCoverage(reqs, questions);
    expect(result.isFullyCovered).toBe(false);
    expect(result.isMustCovered).toBe(true);
    expect(result.uncoveredRequirementIds).toEqual(["r3"]);
    expect(result.mustUncoveredRequirementIds).toEqual([]);
  });
});

describe("Deterministic Schedule Allocator", () => {
  const reqs: Requirement[] = [
    { id: "r1", text: "React", kind: "technical", priority: "must" },
    { id: "r2", text: "Architecture", kind: "technical", priority: "must" },
    { id: "r3", text: "Culture", kind: "behavioural", priority: "nice" },
  ];

  const questions: Question[] = [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "Q1",
      answer_outline: "A1",
      difficulty: 3,
    },
    {
      id: "q2",
      requirement_ids: ["r2"],
      category: "system-design",
      prompt: "Q2",
      answer_outline: "A2",
      difficulty: 3,
    },
    {
      id: "q3",
      requirement_ids: ["r3"],
      category: "company-fit",
      prompt: "Q3",
      answer_outline: "A3",
      difficulty: 1,
    },
  ];

  it("should handle 1-day schedule by placing all questions on day 1", () => {
    const schedule = allocateSchedule(1, questions, reqs);
    expect(schedule.days_available).toBe(1);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].day).toBe(1);
    expect(schedule.days[0].question_ids).toEqual(["q2", "q1", "q3"]);
    expect(Number.isInteger(schedule.days[0].minutes)).toBe(true);
    expect(schedule.days[0].minutes).toBe(20 + 20 + 10);
  });

  it("should handle 5-day schedule exactly matching days count", () => {
    const schedule = allocateSchedule(5, questions, reqs);
    expect(schedule.days_available).toBe(5);
    expect(schedule.days).toHaveLength(5);
    schedule.days.forEach((day, idx) => {
      expect(day.day).toBe(idx + 1);
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
    });

    // Harder must questions should be on earlier days
    const day1Questions = schedule.days[0].question_ids;
    expect(day1Questions).toContain("q2"); // system-design difficulty 3 must
  });

  it("should handle 60-day schedule without error or day gaps", () => {
    const schedule = allocateSchedule(60, questions, reqs);
    expect(schedule.days_available).toBe(60);
    expect(schedule.days).toHaveLength(60);
    for (let i = 0; i < 60; i++) {
      expect(schedule.days[i].day).toBe(i + 1);
      expect(Number.isInteger(schedule.days[i].minutes)).toBe(true);
    }
  });

  it("should handle 2-day schedule with non-zero integer minutes and all days populated", () => {
    const schedule = allocateSchedule(2, questions, reqs);
    expect(schedule.days_available).toBe(2);
    expect(schedule.days).toHaveLength(2);
    expect(schedule.days[0].day).toBe(1);
    expect(schedule.days[1].day).toBe(2);
    expect(Number.isInteger(schedule.days[0].minutes)).toBe(true);
    expect(Number.isInteger(schedule.days[1].minutes)).toBe(true);
    expect(schedule.days[0].minutes).toBeGreaterThan(0);
    expect(schedule.days[1].minutes).toBeGreaterThan(0);
    const allAllocated = schedule.days.flatMap((d) => d.question_ids);
    expect(allAllocated).toContain("q1");
    expect(allAllocated).toContain("q2");
    expect(allAllocated).toContain("q3");
  });

  it("should handle few questions across many days without errors or gaps", () => {
    const twoQuestions: Question[] = [questions[0], questions[1]];
    const schedule = allocateSchedule(7, twoQuestions, reqs);
    expect(schedule.days_available).toBe(7);
    expect(schedule.days).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      expect(schedule.days[i].day).toBe(i + 1);
      expect(Number.isInteger(schedule.days[i].minutes)).toBe(true);
      expect(schedule.days[i].minutes).toBeGreaterThanOrEqual(0);
    }
    const allAllocated = schedule.days.flatMap((d) => d.question_ids);
    expect(allAllocated).toContain("q1");
    expect(allAllocated).toContain("q2");
  });

  it("should handle many questions across few days without dropping any question", () => {
    const manyQuestions: Question[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q_many_${i}`,
      requirement_ids: ["r1"],
      category: i % 2 === 0 ? "technical" : "system-design",
      prompt: `Prompt ${i}`,
      answer_outline: `Outline ${i}`,
      difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    }));

    const schedule = allocateSchedule(2, manyQuestions, reqs);
    expect(schedule.days_available).toBe(2);
    expect(schedule.days).toHaveLength(2);
    expect(Number.isInteger(schedule.days[0].minutes)).toBe(true);
    expect(Number.isInteger(schedule.days[1].minutes)).toBe(true);

    const allAllocated = schedule.days.flatMap((d) => d.question_ids);
    expect(allAllocated).toHaveLength(20);
    for (const q of manyQuestions) {
      expect(allAllocated).toContain(q.id);
    }
  });

  it("should handle schedule when questions are empty", () => {
    const schedule = allocateSchedule(3, [], reqs);
    expect(schedule.days_available).toBe(3);
    expect(schedule.days).toHaveLength(3);
    schedule.days.forEach((day, idx) => {
      expect(day.day).toBe(idx + 1);
      expect(day.question_ids).toHaveLength(0);
      expect(Number.isInteger(day.minutes)).toBe(true);
    });
  });
});

describe("Deterministic Structure Validator", () => {
  const baseValidKit: Kit = {
    source: {
      company: "Acme Corp",
      company_url: "https://acme.com",
      role: "Backend Engineer",
      location: "Remote",
      jd_chars: 1200,
      researched_at: "2026-09-17T02:00:00Z",
      pages_used: ["https://acme.com"],
    },
    company_brief: {
      summary: "Acme builds tools.",
      what_they_do: "Developer platforms.",
      sources: ["https://acme.com"],
    },
    role: {
      title: "Backend Engineer",
      seniority: "Mid",
      responsibilities: ["Code microservices"],
      requirements: [
        { id: "r1", text: "TypeScript", kind: "technical", priority: "must" },
        { id: "r2", text: "Communication", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "TypeScript generics?",
        answer_outline: "Explain constraints and inference.",
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: "f1",
        front: "What is conditional typing?",
        back: "T extends U ? X : Y",
        requirement_ids: ["r1"],
      },
    ],
    schedule: {
      days_available: 1,
      days: [
        {
          day: 1,
          focus: "Full Intensive",
          question_ids: ["q1"],
          minutes: 30,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: ["r2"],
      passes: 1,
    },
  };

  it("should validate a compliant kit", () => {
    const result = validateKitStructure(baseValidKit);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should detect duplicate requirement IDs", () => {
    const kit = JSON.parse(JSON.stringify(baseValidKit));
    kit.role.requirements.push({
      id: "r1", // duplicate
      text: "Another React",
      kind: "technical",
      priority: "nice",
    });
    const result = validateKitStructure(kit);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate requirement ID"))).toBe(true);
  });

  it("should detect broken requirement reference in questions", () => {
    const kit = JSON.parse(JSON.stringify(baseValidKit));
    kit.questions[0].requirement_ids = ["r999"]; // non-existent
    const result = validateKitStructure(kit);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-existent requirement 'r999'"))).toBe(true);
  });

  it("should detect broken question reference in schedule", () => {
    const kit = JSON.parse(JSON.stringify(baseValidKit));
    kit.schedule.days[0].question_ids = ["q999"]; // non-existent
    const result = validateKitStructure(kit);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-existent question ID 'q999'"))).toBe(true);
  });

  it("should detect uncovered must-have requirement when required", () => {
    const kit = JSON.parse(JSON.stringify(baseValidKit));
    kit.role.requirements.push({
      id: "r3",
      text: "Kubernetes cluster administration",
      kind: "technical",
      priority: "must",
    });
    // No question covers r3
    const result = validateKitStructure(kit, { requireMustCoverage: true });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Must-have requirement 'r3' is not covered"))).toBe(
      true
    );
  });

  it("should detect schedule day count mismatch", () => {
    const kit = JSON.parse(JSON.stringify(baseValidKit));
    kit.schedule.days_available = 2; // only 1 day in days array
    const result = validateKitStructure(kit);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not match days_available"))).toBe(true);
  });
});
