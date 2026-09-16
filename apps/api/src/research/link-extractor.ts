import * as cheerio from "cheerio";
import { logger } from "../utils/logger.js";

export interface ExtractedLink {
  url: string;
  anchorText: string;
  title: string;
}

const STRIPPED_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
];

/**
 * Extracts and normalizes all valid internal links from an HTML document.
 */
export function extractInternalLinks(
  html: string,
  baseUrl: string
): ExtractedLink[] {
  let baseParsed: URL;
  try {
    baseParsed = new URL(baseUrl);
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  $("a[href]").each((_, el) => {
    const rawHref = $(el).attr("href")?.trim();
    if (!rawHref) return;

    // Skip tel:, mailto:, javascript:, etc.
    if (/^(javascript|mailto|tel|sms|data):/i.test(rawHref)) {
      return;
    }

    try {
      // Resolve relative link against base URL
      const resolved = new URL(rawHref, baseParsed.toString());

      // Only follow HTTP/HTTPS
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        return;
      }

      // Check if same origin or same root domain
      const isSameHost =
        resolved.hostname === baseParsed.hostname ||
        resolved.hostname.endsWith(`.${baseParsed.hostname}`) ||
        baseParsed.hostname.endsWith(`.${resolved.hostname}`);

      if (!isSameHost) {
        return;
      }

      // Strip hash fragment
      resolved.hash = "";

      // Strip tracking params
      for (const param of STRIPPED_QUERY_PARAMS) {
        resolved.searchParams.delete(param);
      }

      // Normalize trailing slash (unless root or file with extension)
      let normalized = resolved.toString();
      if (normalized.endsWith("/") && resolved.pathname !== "/") {
        normalized = normalized.slice(0, -1);
      }

      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        const anchorText = $(el).text().trim().replace(/\s+/g, " ");
        const title = $(el).attr("title")?.trim() || "";

        links.push({
          url: normalized,
          anchorText,
          title,
        });
      }
    } catch {
      // Ignore unparseable href
    }
  });

  return links;
}
