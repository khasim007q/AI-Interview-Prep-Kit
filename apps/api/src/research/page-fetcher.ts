import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import {
  validateAndNormalizeUrl,
  validateHostResolution,
} from "../security/url-validator.js";

export interface FetchResult {
  url: string;
  finalUrl: string;
  ok: boolean;
  status: number;
  html?: string;
  contentType?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const MAX_REDIRECTS = 5;

/**
 * Fetches an external webpage safely with manual redirect following,
 * per-hop DNS resolution & SSRF validation, timeouts, content-type checks, and size capping.
 */
export async function fetchWebPage(
  initialUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; allowLocalFetch?: boolean } = {}
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? env.CRAWL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? env.MAX_PAGE_BYTES ?? 2 * 1024 * 1024;
  const allowLocalFetch = options.allowLocalFetch ?? env.ALLOW_LOCAL_FETCH;

  let currentUrl = initialUrl;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    // 1. Validate URL syntax and protocol
    const urlValidation = validateAndNormalizeUrl(currentUrl, allowLocalFetch);
    if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        ok: false,
        status: 400,
        error: urlValidation.error || "Invalid URL",
      };
    }
    currentUrl = urlValidation.normalizedUrl;

    // 2. Perform DNS resolution and check against private/metadata IPs
    const parsed = new URL(currentUrl);
    const hostValidation = await validateHostResolution(parsed.hostname, allowLocalFetch);
    if (!hostValidation.isValid) {
      logger.warn(
        { url: currentUrl, error: hostValidation.error },
        "SSRF protection blocked destination host resolution"
      );
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        ok: false,
        status: 403,
        error: hostValidation.error || "Forbidden destination host",
      };
    }

    // 3. Perform manual redirect fetch with retries for transient errors
    let attempt = 0;
    let response: Response | null = null;
    let fetchError = "";

    while (attempt <= MAX_RETRIES) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: "manual", // Crucial: manual inspection of every redirect hop
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        clearTimeout(timer);
        break; // Request completed (either 2xx, 3xx, or 4xx/5xx)
      } catch (err) {
        clearTimeout(timer);
        fetchError = (err as Error)?.message || "Network request failed";
        if (attempt <= MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 400;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    if (!response) {
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        ok: false,
        status: 0,
        error: fetchError || "Fetch failed after retries",
      };
    }

    // 4. Handle HTTP Redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          url: initialUrl,
          finalUrl: currentUrl,
          ok: false,
          status: response.status,
          error: `Redirect response missing Location header`,
        };
      }

      try {
        // Resolve relative redirect against the current URL
        const nextUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        currentUrl = nextUrl;
        logger.debug({ redirectCount, from: currentUrl, to: nextUrl }, "Following redirect hop");
        continue; // Loop to validate and fetch next hop
      } catch {
        return {
          url: initialUrl,
          finalUrl: currentUrl,
          ok: false,
          status: 400,
          error: `Malformed redirect location: '${location}'`,
        };
      }
    }

    // 5. Inspect final response
    if (!response.ok) {
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/xhtml")
    ) {
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        ok: false,
        status: response.status,
        contentType,
        error: `Unsupported content-type: ${contentType}`,
      };
    }

    // Read body up to maxBytes
    const text = await response.text();
    if (text.length > maxBytes) {
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        ok: false,
        status: 413,
        error: `Page content exceeds maximum allowed size (${maxBytes} bytes)`,
      };
    }

    return {
      url: initialUrl,
      finalUrl: currentUrl,
      ok: true,
      status: response.status,
      contentType,
      html: text,
    };
  }

  return {
    url: initialUrl,
    finalUrl: currentUrl,
    ok: false,
    status: 310,
    error: `Exceeded maximum redirect limit (${MAX_REDIRECTS} redirects)`,
  };
}
