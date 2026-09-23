import { ObjectId } from "mongodb";
import { getDatabase } from "./db.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export type ResearchCacheType =
  | "company_crawl"
  | "public_discussion"
  | "llm_extract"
  | "llm_brief";

export interface ResearchCacheDoc<T = unknown> {
  _id?: ObjectId;
  key: string;
  type: ResearchCacheType;
  value: T;
  createdAt: Date;
  expiresAt: Date;
  version: number;
}

export class ResearchCacheRepository {
  private inFlightMap = new Map<string, Promise<unknown>>();
  public customCollection?: any;

  private get collection() {
    if (this.customCollection) return this.customCollection;
    return getDatabase().collection<ResearchCacheDoc>("research_cache");
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const doc = await this.collection.findOne({ key });
      if (!doc) return null;

      if (new Date() >= doc.expiresAt) {
        // Expired entry
        await this.collection.deleteOne({ key }).catch(() => {});
        return null;
      }

      return doc.value as T;
    } catch (err) {
      logger.debug({ err, key }, "Research cache read skipped (database not available or error)");
      return null;
    }
  }

  async set<T>(
    key: string,
    type: ResearchCacheType,
    value: T,
    ttlHours: number = env.RESEARCH_CACHE_TTL_HOURS
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

      await this.collection.updateOne(
        { key },
        {
          $set: {
            key,
            type,
            value,
            createdAt: now,
            expiresAt,
            version: 1,
          },
        },
        { upsert: true }
      );
    } catch (err) {
      logger.debug({ err, key }, "Research cache write skipped");
    }
  }

  /**
   * Retrieves from MongoDB cache, joins in-flight requests if duplicate,
   * or runs the fetcher and populates the cache.
   * Guarantees in-flight map cleanup in `finally`.
   */
  async getOrFetch<T>(
    key: string,
    type: ResearchCacheType,
    fetcher: () => Promise<T>,
    ttlHours: number = env.RESEARCH_CACHE_TTL_HOURS
  ): Promise<{ data: T; cacheHit: boolean }> {
    // 1. Check persistent MongoDB cache
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      logger.info({ key, type, cacheHit: true }, "Research cache hit from MongoDB");
      return { data: cached, cacheHit: true };
    }

    // 2. Check in-flight duplicate deduplication map
    const existingPromise = this.inFlightMap.get(key) as Promise<T> | undefined;
    if (existingPromise) {
      logger.info({ key, type, deduplicated: true }, "Awaiting in-flight duplicate research request");
      const data = await existingPromise;
      return { data, cacheHit: true };
    }

    // 3. Initiate fetcher and register in-flight promise
    const fetchPromise = (async () => {
      const result = await fetcher();
      await this.set(key, type, result, ttlHours);
      return result;
    })();

    this.inFlightMap.set(key, fetchPromise);

    try {
      const data = await fetchPromise;
      return { data, cacheHit: false };
    } finally {
      this.inFlightMap.delete(key);
    }
  }

  /**
   * Clears the in-memory in-flight deduplication map (for testing).
   */
  clearInFlight(): void {
    this.inFlightMap.clear();
  }
}

export const researchCacheRepository = new ResearchCacheRepository();
