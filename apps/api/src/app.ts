import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { kitsRouter } from "./routes/kits.routes.js";

export const app = express();

// Security and CORS
app.use(
  cors({
    origin: env.FRONTEND_URL,
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

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api/kits", kitsRouter);

// Global Error Middleware
app.use(errorMiddleware);
