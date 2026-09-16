import { z } from "zod";
import {
  QuestionSchema,
  type Requirement,
  type QuestionCategory,
} from "@ai-interview-prep/shared";
import type { LLMRequest } from "../llm-client.js";
import { wrapUntrustedData } from "../../security/prompt-boundary.js";

export const CategoryQuestionsOutputSchema = z.object({
  questions: z.array(QuestionSchema),
});
export type CategoryQuestionsOutput = z.infer<typeof CategoryQuestionsOutputSchema>;

export function buildCategoryQuestionsPrompt(params: {
  category: QuestionCategory;
  requirements: Requirement[];
  roleTitle: string;
  seniority: string;
  companyName: string;
  companySummary: string;
  startQuestionNumber: number;
}): LLMRequest {
  const {
    category,
    requirements,
    roleTitle,
    seniority,
    companyName,
    companySummary,
    startQuestionNumber,
  } = params;

  const systemInstruction = `
You are a Principal Interviewer designing interview question banks for ${category} interview loops.
Your task is to generate rigorous, authentic, category-specific interview questions tailored to the candidate's target role and company.
Every question must map explicitly to at least one stated requirement ID.
Output strictly in JSON matching the specified schema.
`.trim();

  const reqList = requirements
    .map((r) => `ID: ${r.id} | Priority: ${r.priority} | Kind: ${r.kind} | Requirement: ${r.text}`)
    .join("\n");

  const prompt = `
ROLE CONTEXT:
- Target Role: ${roleTitle} (${seniority} level)
- Target Company: ${companyName}
- Company Context: ${companySummary}
- Question Category: "${category}"
- ID Starting Index: q${startQuestionNumber}

REQUIREMENTS TO COVER FOR THIS CATEGORY:
${reqList}

TASK:
Generate 2 to 4 high-yield, realistic interview questions for category "${category}".

RULES:
1. Every generated question MUST reference 1 or more exact requirement IDs from the list above in "requirement_ids". Never invent requirement IDs.
2. "id": Must follow sequential ID numbering: "q${startQuestionNumber}", "q${startQuestionNumber + 1}", etc.
3. "category": Must be strictly "${category}".
4. "difficulty": Must be an integer 1 (Foundation/Standard), 2 (Core Intermediate/Complex), or 3 (Advanced/Staff-level Edge Case).
5. "prompt": Realistic, authentic interview question as an interviewer would ask it.
6. "answer_outline": Comprehensive outline detailing key concepts, trade-offs, architecture decisions, or STAR points that demonstrate mastery.

OUTPUT SCHEMA:
Return ONLY a valid JSON object matching:
{
  "questions": [
    {
      "id": string,
      "requirement_ids": string[],
      "category": "${category}",
      "prompt": string,
      "answer_outline": string,
      "difficulty": 1 | 2 | 3
    }
  ]
}
`.trim();

  return {
    systemInstruction,
    prompt,
    temperature: 0.25,
  };
}
