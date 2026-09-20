import { describe, it, expect } from "vitest";
import {
  KitSchema,
  RequirementSchema,
  QuestionSchema,
  ScheduleSchema,
  BatchInputSchema,
  BatchOutputSchema,
  BatchCaseResultSchema,
} from "@ai-interview-prep/shared";

describe("KitSchema Validation", () => {
  const validKit = {
    source: {
      company: "Acme Corp",
      company_url: "https://acme.com",
      role: "Senior Backend Engineer",
      location: "San Francisco, CA",
      jd_chars: 1450,
      researched_at: "2026-09-17T02:00:00Z",
      pages_used: ["https://acme.com/about", "https://acme.com/jobs"],
    },
    company_brief: {
      summary: "Acme builds scalable developer tools.",
      what_they_do: "Cloud infrastructure management and CI/CD pipelines.",
      sources: ["https://acme.com/about"],
    },
    role: {
      title: "Senior Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Build distributed microservices", "Mentor juniors"],
      requirements: [
        {
          id: "r1",
          text: "5+ years distributed systems with Node.js or Go",
          kind: "technical",
          priority: "must",
        },
        {
          id: "r2",
          text: "Experience with MongoDB and indexing",
          kind: "technical",
          priority: "must",
        },
        {
          id: "r3",
          text: "Demonstrated mentoring experience",
          kind: "behavioural",
          priority: "nice",
        },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "How do you handle distributed transactions across microservices?",
        answer_outline: "Discuss 2PC vs Saga pattern, idempotency keys, and eventual consistency.",
        difficulty: 3,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "technical",
        prompt: "Explain compound indexes in MongoDB and prefix rules.",
        answer_outline: "Cover Equality, Sort, Range (ESR) rule and index intersection.",
        difficulty: 2,
      },
      {
        id: "q3",
        requirement_ids: ["r3"],
        category: "behavioural",
        prompt: "Tell me about a time you helped a junior engineer grow.",
        answer_outline: "STAR format: Situation, Task, Actions taken (pairing/code reviews), Result.",
        difficulty: 1,
      },
    ],
    flashcards: [
      {
        id: "f1",
        front: "What is the ESR rule for compound indexes in MongoDB?",
        back: "Equality first, Sort second, Range third.",
        requirement_ids: ["r2"],
      },
    ],
    schedule: {
      days_available: 3,
      days: [
        {
          day: 1,
          focus: "Distributed Systems & Scalability",
          question_ids: ["q1"],
          minutes: 45,
        },
        {
          day: 2,
          focus: "MongoDB Optimization",
          question_ids: ["q2"],
          minutes: 30,
        },
        {
          day: 3,
          focus: "Leadership & Review",
          question_ids: ["q3"],
          minutes: 25,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };

  it("should validate a completely valid canonical kit", () => {
    const result = KitSchema.safeParse(validKit);
    expect(result.success).toBe(true);
  });

  it("should reject invalid requirement kind", () => {
    const invalid = {
      id: "r1",
      text: "Coding",
      kind: "unsupported-kind",
      priority: "must",
    };
    const result = RequirementSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject invalid question difficulty", () => {
    const invalid = {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "Some prompt",
      answer_outline: "Some outline",
      difficulty: 4, // only 1, 2, 3 allowed
    };
    const result = QuestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should allow question with empty requirement_ids for minimal JDs with 0 requirements", () => {
    const validMinimal = {
      id: "q1",
      requirement_ids: [],
      category: "technical",
      prompt: "Some prompt",
      answer_outline: "Some outline",
      difficulty: 2,
    };
    const result = QuestionSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
  });

  it("should reject schedule with non-integer minutes", () => {
    const invalid = {
      days_available: 1,
      days: [
        {
          day: 1,
          focus: "Day 1",
          question_ids: ["q1"],
          minutes: 30.5,
        },
      ],
    };
    const result = ScheduleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should validate batch input and output contracts", () => {
    const batchInput = [
      {
        id: "case-01",
        jd: "Senior Engineer role...",
        company_url: "https://acme.com",
        days: 5,
      },
    ];
    const inputResult = BatchInputSchema.safeParse(batchInput);
    expect(inputResult.success).toBe(true);

    const batchOutput = {
      version: "1.0",
      generated_at: "2026-09-17T02:00:00Z",
      kits: [
        {
          id: "case-01",
          status: "ok",
          kit: validKit,
          error: null,
        },
        {
          id: "case-02",
          status: "failed",
          kit: null,
          error: {
            code: "COMPANY_UNREACHABLE",
            message: "Company site could not be reached after 3 retries",
          },
        },
      ],
    };
    const outputResult = BatchOutputSchema.safeParse(batchOutput);
    expect(outputResult.success).toBe(true);
  });
});
