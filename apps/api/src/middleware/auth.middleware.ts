import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { AppError } from "./error.middleware.js";
import type { UserResponse } from "@ai-interview-prep/shared";

declare global {
  namespace Express {
    interface Request {
      user?: UserResponse;
      sessionToken?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined = req.cookies?.session_token;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
        token = parts[1];
      }
    }

    if (!token) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const user = await authService.validateSession(token);
    if (!user) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired session");
    }

    req.user = user;
    req.sessionToken = token;
    next();
  } catch (error) {
    next(error);
  }
}
