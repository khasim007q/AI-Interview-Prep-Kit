import { z } from "zod";
import { CompanyBriefSchema } from "@ai-interview-prep/shared";
import type { LLMRequest } from "../llm-client.js";
import { wrapUntrustedData } from "../../security/prompt-boundary.js";
import type { ResearchPage } from "../../research/crawler.js";
import type { SearchResultItem } from "../../research/search-provider.js";

export const CompanyBriefOutputSchema = CompanyBriefSchema;

export function buildCompanyBriefPrompt(
  companyName: string,
  researchPages: ResearchPage[],
  discussionFindings: SearchResultItem[]
): LLMRequest {
  const systemInstruction = `
You are an executive research analyst synthesizing company intelligence for interview candidates.
Groundedness is paramount: every factual claim must be based on the provided research documents.
Do not fabricate products, technologies, or hiring processes not evidenced in the sources.
If certain information was not found in public sources, honestly state that limitation.
Output strictly in JSON matching the specified schema.
`.trim();

  // Format evidence
  const pageSummaries = researchPages
    .slice(0, 8)
    .map(
      (p, i) =>
        `[Document ${i + 1}] Source: ${p.url}\nTitle: ${p.title}\nType: ${p.sourceType}\nContent:\n${p.text.substring(0, 2500)}`
    )
    .join("\n\n---\n\n");

  const discussionSummaries = discussionFindings
    .slice(0, 5)
    .map(
      (d, i) =>
        `[Discussion ${i + 1}] Source: ${d.url}\nTitle: ${d.title}\nSnippet: ${d.snippet}`
    )
    .join("\n\n");

  const sourcesUsed: string[] = [];
  for (const p of researchPages) sourcesUsed.push(p.url);
  for (const d of discussionFindings) sourcesUsed.push(d.url);

  const prompt = `
TASK:
Synthesize an interview preparation company brief for "${companyName}".

Provide:
1. "summary": A concise overview (2 to 4 paragraphs) covering:
   - Company identity, mission, and current scale
   - Engineering/company culture and hiring philosophy evidenced from the research
   - Insights into the interview process or public feedback if available
2. "what_they_do": A clear, objective explanation of their core product, business model, and primary technologies.
3. "sources": Array of URLs actually referenced or used from the evidence.

RESEARCH EVIDENCE:
${wrapUntrustedData("company_pages", pageSummaries || "No company pages were successfully retrieved.")}

${wrapUntrustedData("public_discussion", discussionSummaries || "No public interview discussions were found.")}

AVAILABLE SOURCE URLS:
${JSON.stringify(sourcesUsed.slice(0, 15))}

OUTPUT SCHEMA:
Return ONLY a valid JSON object matching:
{
  "summary": string,
  "what_they_do": string,
  "sources": string[]
}
`.trim();

  return {
    systemInstruction,
    prompt,
    temperature: 0.2,
  };
}
