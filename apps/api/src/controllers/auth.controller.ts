import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { RegisterInputSchema, LoginInputSchema } from "@ai-interview-prep/shared";
import { env } from "../config/env.js";

const COOKIE_NAME = "session_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = RegisterInputSchema.parse(req.body);
      const { user, token } = await authService.register(input.email, input.password);

      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_MS,
      });

      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = LoginInputSchema.parse(req.body);
      const { user, token } = await authService.login(input.email, input.password);

      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_MS,
      });

      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[COOKIE_NAME] || req.sessionToken;
      if (token) {
        await authService.logout(token);
      }

      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response): Promise<void> {
    res.status(200).json({ user: req.user });
  }
}

export const authController = new AuthController();
