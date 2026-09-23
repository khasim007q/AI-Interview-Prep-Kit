import robotsParser from "robots-parser";
import { logger } from "../utils/logger.js";
import { fetchWebPage } from "./page-fetcher.js";
import { validateHostResolution } from "../security/url-validator.js";
import { env } from "../config/env.js";

interface RobotsCacheEntry {
  parser: ReturnType<typeof robotsParser>;
  cachedAt: number;
}

const robotsCache = new Map<string, RobotsCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const USER_AGENT = "AIInterviewPrepBot/1.0 (+https://ai-interview-prep.example.com)";

/**
 * Checks if a given URL is allowed to be crawled according to the site's robots.txt.
 * Fully protects against SSRF on robots.txt requests and redirect hops.
 */
export async function isUrlAllowedByRobots(
  targetUrl: string,
  allowLocalFetch = env.ALLOW_LOCAL_FETCH
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  // SSRF check on target host
  const hostCheck = await validateHostResolution(parsed.hostname, allowLocalFetch);
  if (!hostCheck.isValid) {
    return false;
  }

  const origin = parsed.origin;
  const robotsUrl = `${origin}/robots.txt`;

  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.parser.isAllowed(targetUrl, USER_AGENT) ?? true;
  }

  try {
    const fetchRes = await fetchWebPage(robotsUrl, {
      timeoutMs: 4000,
      maxBytes: 512 * 1024,
      allowLocalFetch,
    });

    if (fetchRes.ok && fetchRes.html) {
      const parser = robotsParser(robotsUrl, fetchRes.html);
      robotsCache.set(origin, { parser, cachedAt: Date.now() });
      return parser.isAllowed(targetUrl, USER_AGENT) ?? true;
    } else {
      // If blocked by SSRF (status 403), reject
      if (fetchRes.status === 403) {
        return false;
      }
      // 404 or missing robots.txt implies no crawl restrictions
      const permissiveParser = robotsParser(robotsUrl, "");
      robotsCache.set(origin, { parser: permissiveParser, cachedAt: Date.now() });
      return true;
    }
  } catch (error) {
    logger.debug({ origin, error }, "Could not fetch robots.txt, defaulting to allowed");
    return true;
  }
}
