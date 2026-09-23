import dns from "node:dns/promises";
import net from "node:net";
import { env } from "../config/env.js";

export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * multicast, or cloud metadata ranges. Handles IPv4-mapped IPv6.
 */
export function isPrivateOrForbiddenIp(ip: string): boolean {
  let cleanIp = ip.toLowerCase().trim();

  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.slice(7);
  }

  // IPv4 checks
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local & AWS/GCP metadata: 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;
    return false;
  }

  // IPv6 checks
  if (net.isIPv6(cleanIp)) {
    // ::1 (Loopback)
    if (cleanIp === "::1" || cleanIp === "0:0:0:0:0:0:0:1") return true;
    // :: (Unspecified)
    if (cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:0") return true;
    // fc00::/7 (Unique Local Address)
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;
    // fe80::/10 (Link-Local)
    if (
      cleanIp.startsWith("fe80") ||
      cleanIp.startsWith("fe9") ||
      cleanIp.startsWith("fea") ||
      cleanIp.startsWith("feb")
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Validates and normalizes an external URL.
 * Protects against SSRF, cloud metadata access, and malicious protocols.
 */
export function validateAndNormalizeUrl(
  rawUrl: string,
  allowLocalFetch = env.ALLOW_LOCAL_FETCH
): UrlValidationResult {
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

  // Cloud metadata and link-local are ALWAYS forbidden
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".internal")
  ) {
    return {
      isValid: false,
      error: `Access to private or metadata host '${hostname}' is forbidden`,
    };
  }

  // Explicit host checks for local/private environments
  if (!allowLocalFetch) {
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) {
      return {
        isValid: false,
        error: `Access to private or local host '${hostname}' is forbidden`,
      };
    }

    if (net.isIP(hostname) && isPrivateOrForbiddenIp(hostname)) {
      return {
        isValid: false,
        error: `Access to private IP space '${hostname}' is forbidden`,
      };
    }
  }

  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
  };
}

/**
 * Resolves destination IP via DNS and verifies it is not a forbidden/private IP.
 */
export async function validateHostResolution(
  hostname: string,
  allowLocalFetch = env.ALLOW_LOCAL_FETCH
): Promise<{ isValid: boolean; ip?: string; error?: string }> {
  if (allowLocalFetch && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return { isValid: true, ip: "127.0.0.1" };
  }

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
      error: `Access to private or metadata host '${hostname}' is forbidden`,
    };
  }

  try {
    const lookup = await dns.lookup(hostname);
    if (!allowLocalFetch && isPrivateOrForbiddenIp(lookup.address)) {
      return {
        isValid: false,
        ip: lookup.address,
        error: `Host '${hostname}' resolves to forbidden private IP address '${lookup.address}'`,
      };
    }
    return { isValid: true, ip: lookup.address };
  } catch (err) {
    return {
      isValid: false,
      error: `DNS resolution failed for '${hostname}': ${(err as Error).message}`,
    };
  }
}
