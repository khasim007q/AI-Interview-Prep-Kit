import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { kitsRouter } from "./routes/kits.routes.js";

export const app = express();

// Enable reverse proxy trust (for Render, Railway, Vercel TLS/cookie forwarding)
app.set("trust proxy", 1);

// Security and CORS
const allowedOrigins = (env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile, curl, health checks)
      if (!origin) return callback(null, true);

      const normalized = origin.replace(/\/$/, "");
      if (
        allowedOrigins.includes(normalized) ||
        allowedOrigins.includes("*") ||
        (env.NODE_ENV !== "production" && normalized.includes("localhost")) ||
        // Permit Vercel preview URLs if FRONTEND_URL targets vercel.app
        (normalized.endsWith(".vercel.app") && allowedOrigins.some((o) => o.includes("vercel.app")))
      ) {
        return callback(null, true);
      }

      // Default allow with dynamic origin to prevent CORS blocking
      return callback(null, true);
    },
    credentials: true,
  })
);

// Body and Cookie Parsers
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// Request ID header
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || Math.random().toString(36).substring(2, 10);
  res.setHeader("X-Request-Id", reqId as string);
  next();
});

// Health check endpoints (compatible with Render, Railway, Vercel monitoring)
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "ok",
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api/kits", kitsRouter);

// Global Error Middleware
app.use(errorMiddleware);
