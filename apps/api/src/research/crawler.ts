import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { fetchWebPage } from "./page-fetcher.js";
import { cleanHtmlDocument } from "./page-cleaner.js";
import { extractInternalLinks } from "./link-extractor.js";
import { rankLinks } from "./link-ranker.js";
import { isUrlAllowedByRobots } from "./robots.js";

export interface ResearchPage {
  url: string;
  title: string;
  text: string;
  sourceType: "company" | "hiring" | "engineering" | "public-discussion";
  retrievedAt: string;
  status: "ok" | "failed";
  error?: string;
}

export interface CrawlResult {
  rootUrl: string;
  pages: ResearchPage[];
  pagesVisitedCount: number;
  hiringPageFound: boolean;
  errors: { url: string; message: string }[];
}

/**
 * Classifies page source type by URL and content signals.
 */
function classifySourceType(
  url: string,
  title: string
): "company" | "hiring" | "engineering" | "public-discussion" {
  const combined = `${url.toLowerCase()} ${title.toLowerCase()}`;
  if (
    combined.includes("career") ||
    combined.includes("job") ||
    combined.includes("hiring") ||
    combined.includes("interview") ||
    combined.includes("openings")
  ) {
    return "hiring";
  }
  if (
    combined.includes("engineering") ||
    combined.includes("tech") ||
    combined.includes("architecture") ||
    combined.includes("developer")
  ) {
    return "engineering";
  }
  return "company";
}

/**
 * Bounded, resilient web crawler for company research.
 */
export async function crawlCompanySite(
  rootUrl: string,
  options: { maxPages?: number; maxDepth?: number } = {}
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? env.CRAWL_MAX_PAGES ?? 10;
  const maxDepth = options.maxDepth ?? env.CRAWL_MAX_DEPTH ?? 2;

  const visitedUrls = new Set<string>();
  const results: ResearchPage[] = [];
  const crawlErrors: { url: string; message: string }[] = [];

  // Priority queue item: { url, depth, score }
  const queue: { url: string; depth: number; score: number }[] = [
    { url: rootUrl, depth: 0, score: 100 },
  ];

  let hiringPageFound = false;

  while (queue.length > 0 && results.length < maxPages) {
    // Sort queue descending by score
    queue.sort((a, b) => b.score - a.score);
    const current = queue.shift()!;

    // Normalize URL
    let normalized = current.url;
    try {
      const p = new URL(normalized);
      p.hash = "";
      normalized = p.toString();
    } catch {
      continue;
    }

    if (visitedUrls.has(normalized)) {
      continue;
    }
    visitedUrls.add(normalized);

    // Robots check
    const allowed = await isUrlAllowedByRobots(normalized);
    if (!allowed) {
      logger.debug({ url: normalized }, "URL disallowed by robots.txt, skipping");
      continue;
    }

    logger.debug({ url: normalized, depth: current.depth }, "Fetching research page");
    const fetchRes = await fetchWebPage(normalized);

    if (!fetchRes.ok || !fetchRes.html) {
      crawlErrors.push({
        url: normalized,
        message: fetchRes.error || "Failed to fetch",
      });
      // Do not fail the whole crawl on individual page failures
      continue;
    }

    // Clean page content
    const cleaned = cleanHtmlDocument(fetchRes.html, fetchRes.finalUrl);
    const sourceType = classifySourceType(cleaned.url, cleaned.title);

    if (sourceType === "hiring") {
      hiringPageFound = true;
    }

    results.push({
      url: cleaned.url,
      title: cleaned.title,
      text: cleaned.text,
      sourceType,
      retrievedAt: new Date().toISOString(),
      status: "ok",
    });

    // Discover next-level links if within maxDepth
    if (current.depth < maxDepth && results.length < maxPages) {
      const extractedLinks = extractInternalLinks(fetchRes.html, fetchRes.finalUrl);
      const ranked = rankLinks(extractedLinks);

      // Only enqueue top positive scoring links
      for (const scored of ranked) {
        if (scored.score > 0 && !visitedUrls.has(scored.url)) {
          queue.push({
            url: scored.url,
            depth: current.depth + 1,
            score: scored.score,
          });
        }
      }
    }
  }

  return {
    rootUrl,
    pages: results,
    pagesVisitedCount: visitedUrls.size,
    hiringPageFound,
    errors: crawlErrors,
  };
}
