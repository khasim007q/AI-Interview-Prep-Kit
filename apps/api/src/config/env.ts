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
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  // Public Search Provider
  SEARCH_PROVIDER: z.string().default("serpapi"),
  SERPAPI_API_KEY: z.string().optional(),

  // Frontend URL
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  // Security & Crawler
  ALLOW_LOCAL_FETCH: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("true"),
  CRAWL_MAX_PAGES: z.coerce.number().default(10),
  CRAWL_MAX_DEPTH: z.coerce.number().default(2),
  CRAWL_TIMEOUT_MS: z.coerce.number().default(10000),
  MAX_PAGE_BYTES: z.coerce.number().default(2 * 1024 * 1024), // 2MB
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
