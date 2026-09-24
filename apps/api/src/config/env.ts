import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

// Load .env from current directory, then check parent/root directory
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Database
  MONGODB_URI: z.string().default("mongodb://localhost:27017/ai-interview-prep"),

  // Authentication
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET should be at least 16 characters long")
    .default("dev-secret-session-key-must-be-changed-in-prod"),

  // LLM Provider
  LLM_PROVIDER: z.string().default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
  GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.5-flash"),
  MAX_ATTEMPTS_PER_MODEL: z.coerce.number().default(2),
  MAX_RETRY_DELAY_MS: z.coerce.number().default(10000),
  LLM_CONCURRENCY: z.coerce.number().default(2),
  MAX_CONCURRENT_LLM_CALLS: z.coerce.number().default(2),
  MAX_GENERATION_TIME_MS: z.coerce.number().default(120000),
  MAX_LLM_CALLS_PER_GENERATION: z.coerce.number().default(12),
  MAX_COVERAGE_PASSES: z.coerce.number().default(2),

  // Public Search Provider
  SEARCH_PROVIDER: z.string().default("serpapi"),
  SERPAPI_API_KEY: z.string().optional(),
  SEARCH_TIMEOUT_MS: z.coerce.number().default(8000),

  // Frontend URL
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  // Security & Crawler
  ALLOW_LOCAL_FETCH: z
    .preprocess((val) => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string") return val === "true" || val === "1";
      return process.env.NODE_ENV !== "production";
    }, z.boolean())
    .default(process.env.NODE_ENV !== "production"),
  CRAWL_MAX_PAGES: z.coerce.number().default(10),
  CRAWL_MAX_DEPTH: z.coerce.number().default(2),
  CRAWL_TIMEOUT_MS: z.coerce.number().default(10000),
  MAX_PAGE_BYTES: z.coerce.number().default(2 * 1024 * 1024), // 2MB
  MAX_CONCURRENT_CRAWL_REQUESTS_PER_DOMAIN: z.coerce.number().default(2),

  // Caching
  RESEARCH_CACHE_TTL_HOURS: z.coerce.number().default(24),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    if (process.env.NODE_ENV === "production") {
      throw new Error("Invalid environment configuration");
    }
  }
  return result.success ? result.data : EnvSchema.parse({});
}

export const env = loadEnv();
