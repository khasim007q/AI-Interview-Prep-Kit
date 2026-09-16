import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
  sourceType: "public-discussion";
}

export interface SearchProvider {
  search(query: string, maxResults?: number): Promise<SearchResultItem[]>;
}

/**
 * SerpAPI implementation of SearchProvider.
 */
export class SerpApiSearchProvider implements SearchProvider {
  constructor(private apiKey: string = env.SERPAPI_API_KEY || "") {}

  async search(query: string, maxResults = 5): Promise<SearchResultItem[]> {
    if (!this.apiKey) {
      logger.warn("SERPAPI_API_KEY is not configured; skipping live web search");
      return [];
    }

    try {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", this.apiKey);
      url.searchParams.set("engine", "google");
      url.searchParams.set("num", maxResults.toString());

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        logger.warn({ status: res.status, query }, "SerpAPI search request failed");
        return [];
      }

      const data = (await res.json()) as {
        organic_results?: Array<{
          link?: string;
          title?: string;
          snippet?: string;
        }>;
      };

      if (!data.organic_results || !Array.isArray(data.organic_results)) {
        return [];
      }

      return data.organic_results.slice(0, maxResults).map((r) => ({
        url: r.link || "",
        title: r.title || "",
        snippet: r.snippet || "",
        sourceType: "public-discussion",
      }));
    } catch (error) {
      logger.warn({ error, query }, "Error executing SerpAPI search");
      return [];
    }
  }
}

/**
 * Mock search provider for unit testing.
 */
export class MockSearchProvider implements SearchProvider {
  constructor(private mockResults: SearchResultItem[] = []) {}

  async search(_query: string): Promise<SearchResultItem[]> {
    return this.mockResults;
  }
}

export const defaultSearchProvider: SearchProvider = new SerpApiSearchProvider();
