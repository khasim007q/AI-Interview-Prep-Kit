import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResearchCacheRepository } from "../../apps/api/src/repositories/research-cache.repository.js";

describe("Research Cache & In-Flight Deduplication", () => {
  let cacheRepo: ResearchCacheRepository;
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    cacheRepo = new ResearchCacheRepository();
    mockStorage = new Map();

    // Mock collection
    (cacheRepo as any).customCollection = {
      findOne: vi.fn(async ({ key }: { key: string }) => {
        return mockStorage.get(key) || null;
      }),
      updateOne: vi.fn(
        async ({ key }: { key: string }, { $set }: { $set: any }) => {
          mockStorage.set(key, $set);
          return { matchedCount: 1, upsertedCount: 1 };
        }
      ),
      deleteOne: vi.fn(async ({ key }: { key: string }) => {
        mockStorage.delete(key);
        return { deletedCount: 1 };
      }),
    };
  });

  it("should deduplicate concurrent in-flight requests and invoke underlying fetcher only once", async () => {
    let callCount = 0;
    const slowFetcher = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 40));
      return { company: "Acme", crawledPages: 5 };
    };

    // Fire 3 concurrent requests for the same key
    const [res1, res2, res3] = await Promise.all([
      cacheRepo.getOrFetch("key_acme_crawl", "company_crawl", slowFetcher),
      cacheRepo.getOrFetch("key_acme_crawl", "company_crawl", slowFetcher),
      cacheRepo.getOrFetch("key_acme_crawl", "company_crawl", slowFetcher),
    ]);

    expect(res1.data).toEqual({ company: "Acme", crawledPages: 5 });
    expect(res2.data).toEqual({ company: "Acme", crawledPages: 5 });
    expect(res3.data).toEqual({ company: "Acme", crawledPages: 5 });

    // The slowFetcher must only have been invoked ONCE
    expect(callCount).toBe(1);
    expect(res1.cacheHit).toBe(false);
    expect(res2.cacheHit).toBe(true);
    expect(res3.cacheHit).toBe(true);
  });

  it("should remove in-flight promise from map when fetcher fails so subsequent requests can retry", async () => {
    let callCount = 0;
    const failingFetcher = async () => {
      callCount++;
      throw new Error("Network timeout during fetch");
    };

    // First request fails
    await expect(
      cacheRepo.getOrFetch("key_failing", "company_crawl", failingFetcher)
    ).rejects.toThrow("Network timeout during fetch");

    expect(callCount).toBe(1);

    // Second request should NOT be stuck or return the old rejected promise; it invokes fetcher again
    const successfulFetcher = async () => {
      callCount++;
      return { recovered: true };
    };

    const res = await cacheRepo.getOrFetch("key_failing", "company_crawl", successfulFetcher);
    expect(res.data).toEqual({ recovered: true });
    expect(callCount).toBe(2);
  });

  it("should return cached value and avoid fetcher on cache hit", async () => {
    // Populate cache
    mockStorage.set("key_cached", {
      key: "key_cached",
      type: "company_crawl",
      value: { data: "cached_payload" },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000), // Valid for 1h
    });

    const fetcher = vi.fn();
    const result = await cacheRepo.getOrFetch("key_cached", "company_crawl", fetcher);

    expect(result.cacheHit).toBe(true);
    expect(result.data).toEqual({ data: "cached_payload" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should ignore and evict expired cache entries", async () => {
    // Populate with expired entry
    mockStorage.set("key_expired", {
      key: "key_expired",
      type: "company_crawl",
      value: { data: "stale" },
      createdAt: new Date(Date.now() - 48 * 3600 * 1000),
      expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
    });

    const freshFetcher = vi.fn().mockResolvedValue({ data: "fresh" });
    const result = await cacheRepo.getOrFetch("key_expired", "company_crawl", freshFetcher);

    expect(result.cacheHit).toBe(false);
    expect(result.data).toEqual({ data: "fresh" });
    expect(freshFetcher).toHaveBeenCalledTimes(1);
  });
});
