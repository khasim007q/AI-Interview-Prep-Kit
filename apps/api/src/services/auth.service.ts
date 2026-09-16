import { userRepository } from "../repositories/user.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  sha256,
} from "../utils/hash.js";
import { AppError } from "../middleware/error.middleware.js";
import type { UserResponse } from "@ai-interview-prep/shared";

// 7 days session duration
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  async register(
    email: string,
    password: string
  ): Promise<{ user: UserResponse; token: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const userDoc = await userRepository.create(normalizedEmail, passwordHash);

    const token = generateSecureToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await sessionRepository.create(userDoc._id, tokenHash, expiresAt);

    return {
      user: {
        id: userDoc._id.toString(),
        email: userDoc.email,
        createdAt: userDoc.createdAt.toISOString(),
      },
      token,
    };
  }

  async login(
    email: string,
    password: string
  ): Promise<{ user: UserResponse; token: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const userDoc = await userRepository.findByEmail(normalizedEmail);
    if (!userDoc) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const isPasswordValid = await verifyPassword(password, userDoc.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const token = generateSecureToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await sessionRepository.create(userDoc._id, tokenHash, expiresAt);

    return {
      user: {
        id: userDoc._id.toString(),
        email: userDoc.email,
        createdAt: userDoc.createdAt.toISOString(),
      },
      token,
    };
  }

  async validateSession(token: string): Promise<UserResponse | null> {
    if (!token) return null;

    const tokenHash = sha256(token);
    const session = await sessionRepository.findByTokenHash(tokenHash);
    if (!session) return null;

    if (new Date() > session.expiresAt) {
      await sessionRepository.deleteByTokenHash(tokenHash);
      return null;
    }

    const user = await userRepository.findById(session.userId);
    if (!user) return null;

    return {
      id: user._id.toString(),
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async logout(token: string): Promise<void> {
    if (token) {
      const tokenHash = sha256(token);
      await sessionRepository.deleteByTokenHash(tokenHash);
    }
  }
}

export const authService = new AuthService();
