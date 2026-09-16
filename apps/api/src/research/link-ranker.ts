import type { ExtractedLink } from "./link-extractor.js";

export interface ScoredLink extends ExtractedLink {
  score: number;
  matchedSignals: string[];
}

const POSITIVE_SIGNALS: { term: string; weight: number }[] = [
  { term: "interview", weight: 15 },
  { term: "hiring", weight: 12 },
  { term: "careers", weight: 10 },
  { term: "career", weight: 10 },
  { term: "jobs", weight: 10 },
  { term: "job", weight: 8 },
  { term: "openings", weight: 10 },
  { term: "candidate", weight: 10 },
  { term: "recruiting", weight: 10 },
  { term: "about", weight: 8 },
  { term: "about-us", weight: 9 },
  { term: "company", weight: 7 },
  { term: "handbook", weight: 8 },
  { term: "culture", weight: 6 },
  { term: "values", weight: 6 },
  { term: "mission", weight: 6 },
  { term: "team", weight: 5 },
  { term: "people", weight: 5 },
  { term: "engineering", weight: 6 },
  { term: "tech", weight: 5 },
  { term: "life-at", weight: 8 },
  { term: "work-with-us", weight: 10 },
  { term: "join-us", weight: 10 },
];

const NEGATIVE_SIGNALS: { term: string; penalty: number }[] = [
  { term: "login", penalty: 25 },
  { term: "signin", penalty: 25 },
  { term: "sign-in", penalty: 25 },
  { term: "signup", penalty: 25 },
  { term: "sign-up", penalty: 25 },
  { term: "register", penalty: 25 },
  { term: "cart", penalty: 25 },
  { term: "checkout", penalty: 25 },
  { term: "pricing", penalty: 20 },
  { term: "billing", penalty: 20 },
  { term: "docs", penalty: 15 },
  { term: "documentation", penalty: 15 },
  { term: "api", penalty: 15 },
  { term: "developer", penalty: 10 },
  { term: "support", penalty: 20 },
  { term: "help", penalty: 15 },
  { term: "privacy", penalty: 20 },
  { term: "terms", penalty: 20 },
  { term: "legal", penalty: 20 },
  { term: "download", penalty: 15 },
  { term: "app", penalty: 10 },
];

/**
 * Ranks internal links by relevance for interview preparation research.
 * Links mentioning hiring, interview processes, engineering culture, and company mission
 * are scored significantly higher than generic or navigational links.
 */
export function rankLinks(links: ExtractedLink[]): ScoredLink[] {
  return links
    .map((link) => {
      let score = 0;
      const matchedSignals: string[] = [];

      const urlLower = link.url.toLowerCase();
      const textLower = link.anchorText.toLowerCase();
      const titleLower = link.title.toLowerCase();
      const combined = `${urlLower} ${textLower} ${titleLower}`;

      // Check positive signals
      for (const { term, weight } of POSITIVE_SIGNALS) {
        if (combined.includes(term)) {
          score += weight;
          matchedSignals.push(`+${weight}:${term}`);
        }
      }

      // Check negative signals
      for (const { term, penalty } of NEGATIVE_SIGNALS) {
        if (combined.includes(term)) {
          score -= penalty;
          matchedSignals.push(`-${penalty}:${term}`);
        }
      }

      // Depth penalty: deeply nested paths receive slight penalty
      try {
        const pathSegments = new URL(link.url).pathname
          .split("/")
          .filter(Boolean);
        if (pathSegments.length > 3) {
          score -= (pathSegments.length - 3) * 2;
        }
      } catch {
        // ignore
      }

      return {
        ...link,
        score,
        matchedSignals,
      };
    })
    .sort((a, b) => b.score - a.score);
}
