import { z } from "zod";
import { FlashcardSchema, type Requirement, type Question } from "@ai-interview-prep/shared";
import type { LLMRequest } from "../llm-client.js";

export const FlashcardsOutputSchema = z.object({
  flashcards: z.array(FlashcardSchema),
});
export type FlashcardsOutput = z.infer<typeof FlashcardsOutputSchema>;

export function buildFlashcardsPrompt(params: {
  requirements: Requirement[];
  questions: Question[];
  companyName: string;
}): LLMRequest {
  const { requirements, questions, companyName } = params;

  const systemInstruction = `
You are a Flashcard Learning Engine specializing in active recall for high-stakes technical interviews.
Generate concise, high-yield flashcards covering key mental models, trade-offs, algorithms, and core concepts from the provided questions and requirements.
Output strictly in JSON matching the specified schema.
`.trim();

  const reqSummary = requirements
    .slice(0, 10)
    .map((r) => `[${r.id}] (${r.kind}/${r.priority}): ${r.text}`)
    .join("\n");

  const questionSummary = questions
    .slice(0, 12)
    .map((q) => `[${q.id}] (${q.category}): ${q.prompt}`)
    .join("\n");

  const prompt = `
TARGET COMPANY: ${companyName}

CORE REQUIREMENTS:
${reqSummary}

REPRESENTATIVE QUESTIONS:
${questionSummary}

TASK:
Generate 5 to 10 active-recall flashcards.

RULES:
1. "id": Sequential IDs ("f1", "f2", "f3", etc.).
2. "front": A crisp question, scenario, or concept to recall.
3. "back": Concise, bulleted or direct answer highlighting the core takeaway (under 3 sentences or 4 bullets).
4. "requirement_ids": Array of requirement IDs this card reinforces (e.g. ["r1"]).

OUTPUT SCHEMA:
Return ONLY a valid JSON object matching:
{
  "flashcards": [
    {
      "id": string,
      "front": string,
      "back": string,
      "requirement_ids": string[]
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
