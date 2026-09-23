import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { fetchWebPage } from "./page-fetcher.js";
import { cleanHtmlDocument } from "./page-cleaner.js";
import { extractInternalLinks } from "./link-extractor.js";
import { rankLinks } from "./link-ranker.js";
import { isUrlAllowedByRobots } from "./robots.js";
import { createLimiter } from "../utils/limiter.js";
import { researchCacheRepository } from "../repositories/research-cache.repository.js";
import { sha256 } from "../utils/hash.js";

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
export function classifySourceType(
  url: string,
  title: string
): "company" | "hiring" | "engineering" | "public-discussion" {
  const combined = `${url.toLowerCase()} ${title.toLowerCase()}`;
  if (
    combined.includes("career") ||
    combined.includes("job") ||
    combined.includes("hiring") ||
    combined.includes("interview") ||
    combined.includes("openings") ||
    combined.includes("work-with-us") ||
    combined.includes("join-us") ||
    combined.includes("positions") ||
    combined.includes("vacancies")
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
 * Integrates bounded concurrency per domain, robots.txt SSRF defense,
 * persistent MongoDB research caching, and in-flight request deduplication.
 */
export async function crawlCompanySite(
  rootUrl: string,
  options: {
    maxPages?: number;
    maxDepth?: number;
    concurrency?: number;
    bypassCache?: boolean;
  } = {}
): Promise<CrawlResult> {
  const normalizedRoot = rootUrl.trim().toLowerCase().replace(/\/+$/, "");

  if (!options.bypassCache) {
    const cacheKey = sha256(`company_crawl::${normalizedRoot}::v1`);
    const { data } = await researchCacheRepository.getOrFetch<CrawlResult>(
      cacheKey,
      "company_crawl",
      () => executeCrawl(rootUrl, options)
    );
    return data;
  }

  return executeCrawl(rootUrl, options);
}

async function executeCrawl(
  rootUrl: string,
  options: {
    maxPages?: number;
    maxDepth?: number;
    concurrency?: number;
  } = {}
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? env.CRAWL_MAX_PAGES ?? 10;
  const maxDepth = options.maxDepth ?? env.CRAWL_MAX_DEPTH ?? 2;
  const concurrency =
    options.concurrency ?? env.MAX_CONCURRENT_CRAWL_REQUESTS_PER_DOMAIN ?? 2;

  const limiter = createLimiter(concurrency);
  const visitedUrls = new Set<string>();
  const results: ResearchPage[] = [];
  const crawlErrors: { url: string; message: string }[] = [];

  // Priority queue item: { url, depth, score }
  const queue: { url: string; depth: number; score: number }[] = [
    { url: rootUrl, depth: 0, score: 100 },
  ];

  let hiringPageFound = false;

  while (queue.length > 0 && results.length < maxPages) {
    // Collect a bounded batch of candidate links to fetch concurrently
    const batch: { url: string; depth: number; score: number }[] = [];

    while (
      queue.length > 0 &&
      batch.length < concurrency &&
      results.length + batch.length < maxPages
    ) {
      queue.sort((a, b) => b.score - a.score);
      const current = queue.shift()!;

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
      batch.push({ ...current, url: normalized });
    }

    if (batch.length === 0) break;

    // Fetch batch with bounded concurrency limiter
    await Promise.all(
      batch.map((item) =>
        limiter(async () => {
          // Robots check
          const allowed = await isUrlAllowedByRobots(item.url);
          if (!allowed) {
            logger.debug({ url: item.url }, "URL disallowed by robots.txt, skipping");
            return;
          }

          logger.debug({ url: item.url, depth: item.depth }, "Fetching research page");
          const fetchRes = await fetchWebPage(item.url);

          if (!fetchRes.ok || !fetchRes.html) {
            crawlErrors.push({
              url: item.url,
              message: fetchRes.error || "Failed to fetch",
            });
            return;
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
          if (item.depth < maxDepth && results.length < maxPages) {
            const extractedLinks = extractInternalLinks(fetchRes.html, fetchRes.finalUrl);
            const ranked = rankLinks(extractedLinks);

            for (const scored of ranked) {
              if (scored.score > 0 && !visitedUrls.has(scored.url)) {
                queue.push({
                  url: scored.url,
                  depth: item.depth + 1,
                  score: scored.score,
                });
              }
            }
          }
        })
      )
    );
  }

  return {
    rootUrl,
    pages: results,
    pagesVisitedCount: visitedUrls.size,
    hiringPageFound,
    errors: crawlErrors,
  };
}
