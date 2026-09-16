import { z } from "zod";
import { KitSchema } from "./kit.js";

export const BatchCaseInputSchema = z.object({
  id: z.string().min(1, "Case ID must not be empty"),
  jd: z.string().min(1, "Job description must not be empty"),
  company_url: z.string().min(1, "Company URL must not be empty"),
  days: z.number().int().positive("Days must be a positive integer"),
});
export type BatchCaseInput = z.infer<typeof BatchCaseInputSchema>;

export const BatchInputSchema = z.array(BatchCaseInputSchema);
export type BatchInput = z.infer<typeof BatchInputSchema>;

export const BatchCaseErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type BatchCaseError = z.infer<typeof BatchCaseErrorSchema>;

export const BatchCaseResultSuccessSchema = z.object({
  id: z.string(),
  status: z.literal("ok"),
  kit: KitSchema,
  error: z.null(),
});
export type BatchCaseResultSuccess = z.infer<typeof BatchCaseResultSuccessSchema>;

export const BatchCaseResultFailureSchema = z.object({
  id: z.string(),
  status: z.literal("failed"),
  kit: z.null(),
  error: BatchCaseErrorSchema,
});
export type BatchCaseResultFailure = z.infer<typeof BatchCaseResultFailureSchema>;

export const BatchCaseResultSchema = z.discriminatedUnion("status", [
  BatchCaseResultSuccessSchema,
  BatchCaseResultFailureSchema,
]);
export type BatchCaseResult = z.infer<typeof BatchCaseResultSchema>;

export const BatchOutputSchema = z.object({
  version: z.string().default("1.0"),
  generated_at: z.string(),
  kits: z.array(BatchCaseResultSchema),
});
export type BatchOutput = z.infer<typeof BatchOutputSchema>;
