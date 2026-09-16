import { z } from "zod";
import { QuestionSchema, type Requirement } from "@ai-interview-prep/shared";
import type { LLMRequest } from "../llm-client.js";

export const TargetedQuestionsOutputSchema = z.object({
  questions: z.array(QuestionSchema),
});
export type TargetedQuestionsOutput = z.infer<typeof TargetedQuestionsOutputSchema>;

export function buildTargetedQuestionsPrompt(params: {
  uncoveredRequirements: Requirement[];
  roleTitle: string;
  companyName: string;
  startQuestionNumber: number;
}): LLMRequest {
  const { uncoveredRequirements, roleTitle, companyName, startQuestionNumber } = params;

  const systemInstruction = `
You are a Coverage Optimization Engine for interview preparation.
Your sole purpose is to close coverage gaps by generating targeted questions for requirements that currently lack interview questions.
Every question must map directly to one or more of the specified uncovered requirements.
Output strictly in JSON matching the specified schema.
`.trim();

  const reqList = uncoveredRequirements
    .map((r) => `ID: ${r.id} | Priority: ${r.priority} | Kind: ${r.kind} | Requirement: ${r.text}`)
    .join("\n");

  const prompt = `
ROLE: ${roleTitle} at ${companyName}

CURRENTLY UNCOVERED REQUIREMENTS:
${reqList}

TASK:
For EACH uncovered requirement listed above, generate at least one targeted interview question ensuring 100% coverage of these missing requirements.

RULES:
1. Every uncovered requirement ID MUST be included in the "requirement_ids" array of at least one generated question.
2. "id": Sequential starting at "q${startQuestionNumber}", "q${startQuestionNumber + 1}", etc.
3. "category": Choose the most appropriate category: "technical" for technical/tools, "system-design" for architecture, "behavioural" for soft skills/mentorship, or "company-fit" for culture/mission.
4. "difficulty": 1, 2, or 3.
5. "prompt" & "answer_outline": Clear, professional, and detailed.

OUTPUT SCHEMA:
Return ONLY a valid JSON object matching:
{
  "questions": [
    {
      "id": string,
      "requirement_ids": string[],
      "category": "technical" | "behavioural" | "system-design" | "company-fit",
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
    temperature: 0.2,
  };
}
