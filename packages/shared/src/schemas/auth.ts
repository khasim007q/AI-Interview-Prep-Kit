import { z } from "zod";

export const RegisterInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.string(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;
