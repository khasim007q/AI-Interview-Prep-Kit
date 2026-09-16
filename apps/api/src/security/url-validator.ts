import { env } from "../config/env.js";

const PRIVATE_IP_PATTERNS = [
  /^127\./, // 127.0.0.0/8 Loopback
  /^10\./, // 10.0.0.0/8 Private
  /^192\.168\./, // 192.168.0.0/16 Private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 Private
  /^169\.254\./, // 169.254.0.0/16 Link-local / AWS metadata
  /^0\.0\.0\.0/,
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 Unique Local
  /^fe80:/, // IPv6 Link-Local
];

export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Validates and normalizes an external URL.
 * Protects against SSRF, cloud metadata access, and malicious protocols.
 */
export function validateAndNormalizeUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "URL is empty or not a string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, error: "Malformed URL syntax" };
  }

  // Restrict protocol to HTTP and HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      isValid: false,
      error: `Unsupported protocol: '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`,
    };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      error: "URLs containing authentication credentials are not permitted",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // If local fetch is not allowed, block localhost and private IPs
  if (!env.ALLOW_LOCAL_FETCH) {
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) {
      return {
        isValid: false,
        error: `Access to private or local host '${hostname}' is forbidden`,
      };
    }

    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          isValid: false,
          error: `Access to private IP space '${hostname}' is forbidden`,
        };
      }
    }
  }

  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
  };
}
