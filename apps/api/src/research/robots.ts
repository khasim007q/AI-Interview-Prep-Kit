import robotsParser from "robots-parser";
import { logger } from "../utils/logger.js";

interface RobotsCacheEntry {
  parser: ReturnType<typeof robotsParser>;
  cachedAt: number;
}

const robotsCache = new Map<string, RobotsCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const USER_AGENT = "AIInterviewPrepBot/1.0 (+https://ai-interview-prep.example.com)";

/**
 * Checks if a given URL is allowed to be crawled according to the site's robots.txt.
 */
export async function isUrlAllowedByRobots(targetUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  const origin = parsed.origin;
  const robotsUrl = `${origin}/robots.txt`;

  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.parser.isAllowed(targetUrl, USER_AGENT) ?? true;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const robotsText = await res.text();
      const parser = robotsParser(robotsUrl, robotsText);
      robotsCache.set(origin, { parser, cachedAt: Date.now() });
      return parser.isAllowed(targetUrl, USER_AGENT) ?? true;
    } else {
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
