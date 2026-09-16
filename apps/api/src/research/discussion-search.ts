import { defaultSearchProvider, type SearchProvider, type SearchResultItem } from "./search-provider.js";
import { logger } from "../utils/logger.js";

export interface PublicInterviewResearch {
  company: string;
  hasDiscussion: boolean;
  findings: SearchResultItem[];
  summaryNote?: string;
}

/**
 * Researches public discussion about the company's hiring and interview process.
 * 
 * Rules:
 * - Separates public discussion from official company website facts
 * - Tolerates zero search results gracefully (records honest gap, does not fabricate)
 * - Retains source URLs for provenance
 */
export async function researchPublicInterviewDiscussion(
  companyName: string,
  provider: SearchProvider = defaultSearchProvider
): Promise<PublicInterviewResearch> {
  const cleanCompany = companyName.trim();
  if (!cleanCompany) {
    return {
      company: "",
      hasDiscussion: false,
      findings: [],
      summaryNote: "No company name provided for public interview research.",
    };
  }

  const queries = [
    `"${cleanCompany}" interview process experience`,
    `"${cleanCompany}" technical interview questions`,
  ];

  const allFindings: SearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      const results = await provider.search(query, 3);
      for (const res of results) {
        if (res.url && !seenUrls.has(res.url)) {
          seenUrls.add(res.url);
          allFindings.push(res);
        }
      }
    } catch (error) {
      logger.debug({ error, query }, "Query failed during public discussion search");
    }
  }

  const hasDiscussion = allFindings.length > 0;

  return {
    company: cleanCompany,
    hasDiscussion,
    findings: allFindings,
    summaryNote: hasDiscussion
      ? `Found ${allFindings.length} public discussions regarding ${cleanCompany}'s interview process.`
      : `Public discussion of ${cleanCompany}'s interview process was unavailable. Kit will be generated from company materials and JD requirements.`,
  };
}
