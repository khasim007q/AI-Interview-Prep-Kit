import { describe, it, expect, vi, beforeEach } from "vitest";
import cookie from "cookie";
import { ObjectId } from "mongodb";

describe("Production Authentication & Cookie Security", () => {
  it("should format production cookies with SameSite=None, Secure, HttpOnly, and Partitioned (CHIPS)", () => {
    const isProd = true;
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? "none" : "lax") as "none" | "lax",
      path: "/",
      ...(isProd ? { partitioned: true } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    const serialized = cookie.serialize("session_token", "sample_secure_session_token", cookieOptions);

    expect(serialized).toContain("session_token=sample_secure_session_token");
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("Secure");
    expect(serialized).toContain("SameSite=None");
    expect(serialized).toContain("Partitioned");
    expect(serialized).toContain("Path=/");
  });

  it("should format development cookies without breaking localhost (SameSite=Lax, Secure=false, unpartitioned)", () => {
    const isProd = false;
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? "none" : "lax") as "none" | "lax",
      path: "/",
      ...(isProd ? { partitioned: true } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    const serialized = cookie.serialize("session_token", "sample_dev_token", cookieOptions);

    expect(serialized).toContain("session_token=sample_dev_token");
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("SameSite=Lax");
    expect(serialized).not.toContain("Partitioned");
    expect(serialized).not.toContain("Secure;");
  });

  it("should format clearCookie matching production partitioned parameters", () => {
    const isProd = true;
    const clearOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? "none" : "lax") as "none" | "lax",
      path: "/",
      ...(isProd ? { partitioned: true } : {}),
      expires: new Date(1),
    };

    const serialized = cookie.serialize("session_token", "", clearOptions);

    expect(serialized).toContain("session_token=");
    expect(serialized).toContain("Expires=Thu, 01 Jan 1970");
    expect(serialized).toContain("Partitioned");
    expect(serialized).toContain("SameSite=None");
    expect(serialized).toContain("Secure");
  });
});

describe("Multi-Session Model Independence (Device A vs Device B)", () => {
  it("should maintain independent sessions for multiple devices and allow logout without affecting other sessions", () => {
    // In-memory simulation of sessionRepository storage
    const fakeSessionDb = new Map<string, { userId: string; tokenHash: string; expiresAt: Date }>();

    const userId = new ObjectId().toString();
    const tokenHashA = "hash_of_device_a_token";
    const tokenHashB = "hash_of_device_b_token";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Device A logs in
    fakeSessionDb.set(tokenHashA, { userId, tokenHash: tokenHashA, expiresAt });
    expect(fakeSessionDb.has(tokenHashA)).toBe(true);

    // Device B logs in with same user account
    fakeSessionDb.set(tokenHashB, { userId, tokenHash: tokenHashB, expiresAt });
    expect(fakeSessionDb.has(tokenHashB)).toBe(true);
    expect(fakeSessionDb.has(tokenHashA)).toBe(true);
    expect(fakeSessionDb.size).toBe(2);

    // Device B logs out (only tokenHashB is deleted)
    fakeSessionDb.delete(tokenHashB);

    // Verify Device B is logged out, but Device A remains fully active
    expect(fakeSessionDb.has(tokenHashB)).toBe(false);
    expect(fakeSessionDb.has(tokenHashA)).toBe(true);
    expect(fakeSessionDb.get(tokenHashA)?.userId).toBe(userId);
  });
});

describe("CORS Origin Validation Logic", () => {
  const allowedOrigins = ["https://ai-interview-prep-kit-web-zlwr.vercel.app"];

  function checkOriginAllowed(origin: string | undefined, isProd: boolean): boolean {
    if (!origin) return true; // Server-to-server, curl, health checks
    const normalized = origin.replace(/\/$/, "");

    if (!isProd) {
      if (
        normalized.includes("localhost") ||
        normalized.includes("127.0.0.1") ||
        allowedOrigins.includes(normalized)
      ) {
        return true;
      }
    }

    const isAllowed =
      allowedOrigins.includes(normalized) ||
      (normalized.endsWith(".vercel.app") && allowedOrigins.some((o) => o.includes("vercel.app")));

    return isAllowed;
  }

  it("should permit requests without Origin header (curl, CLI batch evaluator, server health checks)", () => {
    expect(checkOriginAllowed(undefined, true)).toBe(true);
  });

  it("should allow configured production Vercel frontend URL", () => {
    expect(checkOriginAllowed("https://ai-interview-prep-kit-web-zlwr.vercel.app", true)).toBe(true);
    expect(checkOriginAllowed("https://ai-interview-prep-kit-web-zlwr.vercel.app/", true)).toBe(true);
  });

  it("should allow Vercel preview URLs when production targets vercel.app", () => {
    expect(checkOriginAllowed("https://ai-interview-prep-kit-web-git-feat-test.vercel.app", true)).toBe(true);
  });

  it("should reject untrusted third-party origins in production", () => {
    expect(checkOriginAllowed("https://evil-phishing-site.com", true)).toBe(false);
    expect(checkOriginAllowed("https://attacker.io", true)).toBe(false);
    expect(checkOriginAllowed("http://localhost:3000", true)).toBe(false);
  });

  it("should allow localhost in development mode", () => {
    expect(checkOriginAllowed("http://localhost:3000", false)).toBe(true);
    expect(checkOriginAllowed("http://127.0.0.1:3000", false)).toBe(true);
  });
});

describe("CSRF Origin Middleware Logic", () => {
  const allowedOrigins = ["https://ai-interview-prep-kit-web-zlwr.vercel.app"];
  const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  function shouldBlockCsrf(method: string, origin: string | undefined, isProd: boolean): boolean {
    if (isProd && STATE_CHANGING_METHODS.has(method)) {
      if (origin) {
        const normalized = origin.replace(/\/$/, "");
        const isAllowed =
          allowedOrigins.includes(normalized) ||
          (normalized.endsWith(".vercel.app") && allowedOrigins.some((o) => o.includes("vercel.app")));
        if (!isAllowed) {
          return true; // Blocked
        }
      }
    }
    return false; // Allowed
  }

  it("should block POST from untrusted origin in production", () => {
    expect(shouldBlockCsrf("POST", "https://unauthorized-domain.com", true)).toBe(true);
  });

  it("should allow POST from authorized Vercel frontend in production", () => {
    expect(shouldBlockCsrf("POST", "https://ai-interview-prep-kit-web-zlwr.vercel.app", true)).toBe(false);
  });

  it("should allow POST without origin (CLI evaluator, curl, backend scripts)", () => {
    expect(shouldBlockCsrf("POST", undefined, true)).toBe(false);
  });

  it("should allow GET requests from any origin without CSRF blocking", () => {
    expect(shouldBlockCsrf("GET", "https://unauthorized-domain.com", true)).toBe(false);
  });

  it("should not block in development mode", () => {
    expect(shouldBlockCsrf("POST", "http://localhost:3000", false)).toBe(false);
  });
});
