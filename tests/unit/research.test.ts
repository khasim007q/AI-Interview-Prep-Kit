import { describe, it, expect } from "vitest";
import { cleanHtmlDocument } from "../../apps/api/src/research/page-cleaner.js";
import { extractInternalLinks } from "../../apps/api/src/research/link-extractor.js";
import { rankLinks } from "../../apps/api/src/research/link-ranker.js";
import { researchPublicInterviewDiscussion } from "../../apps/api/src/research/discussion-search.js";
import { MockSearchProvider } from "../../apps/api/src/research/search-provider.js";

describe("Research Engine - Page Cleaner", () => {
  it("should strip navigation, footer, scripts, and extract structured text", () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Acme Engineering - Careers</title></head>
        <body>
          <nav><a href="/">Home</a><a href="/login">Login</a></nav>
          <script>console.log("tracking");</script>
          <main>
            <h1>Join Our Engineering Team</h1>
            <p>We build resilient distributed cloud systems with TypeScript and Go.</p>
            <h2>Interview Process</h2>
            <ul>
              <li>Round 1: Screening</li>
              <li>Round 2: Technical Deep Dive</li>
            </ul>
          </main>
          <footer><p>&copy; 2026 Acme Corp. All rights reserved.</p></footer>
        </body>
      </html>
    `;

    const cleaned = cleanHtmlDocument(rawHtml, "https://acme.com/careers");
    expect(cleaned.title).toBe("Acme Engineering - Careers");
    expect(cleaned.text).toContain("Join Our Engineering Team");
    expect(cleaned.text).toContain("Interview Process");
    expect(cleaned.text).not.toContain("console.log");
    expect(cleaned.text).not.toContain("All rights reserved");
    expect(cleaned.charCount).toBeGreaterThan(0);
    expect(cleaned.contentHash).toHaveLength(64);
  });
});

describe("Research Engine - Link Extractor & Ranker", () => {
  const sampleHtml = `
    <html>
      <body>
        <a href="/about-us">About Acme</a>
        <a href="/careers/engineering">Engineering Careers</a>
        <a href="https://acme.com/jobs/senior-backend?utm_source=linkedin#apply">Senior Backend Role</a>
        <a href="/pricing">View Pricing</a>
        <a href="/login">Sign In</a>
        <a href="https://otherdomain.com/blog">External Blog</a>
        <a href="mailto:jobs@acme.com">Email Us</a>
      </body>
    </html>
  `;

  it("should extract internal links and resolve relative paths correctly", () => {
    const links = extractInternalLinks(sampleHtml, "https://acme.com");
    const urls = links.map((l) => l.url);

    expect(urls).toContain("https://acme.com/about-us");
    expect(urls).toContain("https://acme.com/careers/engineering");
    expect(urls).toContain("https://acme.com/jobs/senior-backend");
    expect(urls).not.toContain("https://otherdomain.com/blog");
    expect(urls.some((u) => u.startsWith("mailto:"))).toBe(false);
  });

  it("should rank hiring and interview links significantly higher than login or pricing", () => {
    const links = extractInternalLinks(sampleHtml, "https://acme.com");
    const ranked = rankLinks(links);

    const careerLink = ranked.find((l) => l.url.includes("careers"));
    const jobLink = ranked.find((l) => l.url.includes("jobs"));
    const loginLink = ranked.find((l) => l.url.includes("login"));
    const pricingLink = ranked.find((l) => l.url.includes("pricing"));

    expect(careerLink).toBeDefined();
    expect(jobLink).toBeDefined();
    expect(careerLink!.score).toBeGreaterThan(0);
    expect(jobLink!.score).toBeGreaterThan(0);

    if (loginLink) {
      expect(loginLink.score).toBeLessThan(0);
    }
    if (pricingLink) {
      expect(pricingLink.score).toBeLessThan(0);
    }

    // Top link should be career/job related
    expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score);
  });

  it("should rank and discover non-standard hiring links like /work-with-us and /join-us", () => {
    const customHtml = `
      <html>
        <body>
          <a href="/work-with-us">Work With Us</a>
          <a href="/join-us">Join Our Team</a>
          <a href="/terms">Terms of Service</a>
        </body>
      </html>
    `;
    const links = extractInternalLinks(customHtml, "https://startup.io");
    const ranked = rankLinks(links);

    const workLink = ranked.find((l) => l.url.includes("work-with-us"));
    const joinLink = ranked.find((l) => l.url.includes("join-us"));
    const termsLink = ranked.find((l) => l.url.includes("terms"));

    expect(workLink).toBeDefined();
    expect(joinLink).toBeDefined();
    expect(workLink!.score).toBeGreaterThan(0);
    expect(joinLink!.score).toBeGreaterThan(0);
    expect(termsLink!.score).toBeLessThan(0);
  });
});

describe("Research Engine - Source Type Classifier", () => {
  it("should accurately classify hiring, engineering, and generic company pages", async () => {
    const { classifySourceType } = await import("../../apps/api/src/research/crawler.js");

    expect(classifySourceType("https://example.com/careers", "Careers at Acme")).toBe("hiring");
    expect(classifySourceType("https://example.com/work-with-us", "Join Our Team")).toBe("hiring");
    expect(classifySourceType("https://example.com/openings", "Current Positions")).toBe("hiring");
    expect(classifySourceType("https://example.com/tech-blog", "Engineering Architecture")).toBe("engineering");
    expect(classifySourceType("https://example.com/about", "About Us")).toBe("company");
  });
});

describe("Research Engine - Public Discussion Search", () => {
  it("should handle zero results with honest research gap note", async () => {
    const emptyProvider = new MockSearchProvider([]);
    const res = await researchPublicInterviewDiscussion("ObscureStealthStartup", emptyProvider);

    expect(res.hasDiscussion).toBe(false);
    expect(res.findings).toHaveLength(0);
    expect(res.summaryNote).toContain("unavailable");
  });

  it("should aggregate search findings when available", async () => {
    const mockProvider = new MockSearchProvider([
      {
        url: "https://glassdoor.com/interview/acme",
        title: "Acme Interview Questions",
        snippet: "Two technical rounds with focus on system design.",
        sourceType: "public-discussion",
      },
    ]);

    const res = await researchPublicInterviewDiscussion("Acme", mockProvider);
    expect(res.hasDiscussion).toBe(true);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].title).toBe("Acme Interview Questions");
  });
});
