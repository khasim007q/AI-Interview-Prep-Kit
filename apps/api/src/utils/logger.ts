import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "SYS:standard",
          },
        }
      : undefined,
  redact: [
    "password",
    "passwordHash",
    "token",
    "tokenHash",
    "cookie",
    "authorization",
    "headers.cookie",
    "headers.authorization",
    "req.headers.cookie",
    "req.headers.authorization",
  ],
});
