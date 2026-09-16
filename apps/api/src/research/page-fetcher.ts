import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { validateAndNormalizeUrl } from "../security/url-validator.js";

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

/**
 * Fetches an external webpage safely with timeouts, redirects handling,
 * content-type validation, and size capping.
 */
export async function fetchWebPage(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<FetchResult> {
  const validation = validateAndNormalizeUrl(url);
  if (!validation.isValid || !validation.normalizedUrl) {
    return {
      url,
      finalUrl: url,
      ok: false,
      status: 400,
      error: validation.error || "Invalid URL",
    };
  }

  const normalizedUrl = validation.normalizedUrl;
  const timeoutMs = options.timeoutMs ?? env.CRAWL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? env.MAX_PAGE_BYTES ?? 2 * 1024 * 1024;

  let attempt = 0;
  let lastError = "";

  while (attempt <= MAX_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(normalizedUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      clearTimeout(timer);

      if (!response.ok) {
        // Retry for transient status codes (500, 502, 503, 504, 429)
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt <= MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        return {
          url: normalizedUrl,
          finalUrl: response.url,
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
          url: normalizedUrl,
          finalUrl: response.url,
          ok: false,
          status: response.status,
          contentType,
          error: `Unsupported content-type: ${contentType}`,
        };
      }

      // Read text while guarding size
      const text = await response.text();
      if (text.length > maxBytes) {
        return {
          url: normalizedUrl,
          finalUrl: response.url,
          ok: false,
          status: 413,
          error: `Page size exceeds maximum allowed limit (${maxBytes} bytes)`,
        };
      }

      return {
        url: normalizedUrl,
        finalUrl: response.url,
        ok: true,
        status: response.status,
        html: text,
        contentType,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = (err as Error)?.name === "AbortError";
      lastError = isAbort ? `Request timed out after ${timeoutMs}ms` : ((err as Error)?.message || "Network error");

      if (attempt <= MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  logger.debug({ url: normalizedUrl, error: lastError }, "Fetch failed after retries");
  return {
    url: normalizedUrl,
    finalUrl: normalizedUrl,
    ok: false,
    status: 0,
    error: lastError,
  };
}
