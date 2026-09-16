import { z } from "zod";

export const PracticeConfidenceSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type PracticeConfidence = z.infer<typeof PracticeConfidenceSchema>;

export const PracticeAttemptInputSchema = z.object({
  kitId: z.string(),
  flashcardId: z.string(),
  confidence: PracticeConfidenceSchema,
});
export type PracticeAttemptInput = z.infer<typeof PracticeAttemptInputSchema>;

export const PracticeSummarySchema = z.object({
  kitId: z.string(),
  totalFlashcards: z.number().int().nonnegative(),
  attemptedCount: z.number().int().nonnegative(),
  averageConfidence: z.number(),
  confidenceDistribution: z.record(z.string(), z.number()),
  weakFlashcardIds: z.array(z.string()),
  weakRequirementIds: z.array(z.string()),
});
export type PracticeSummary = z.infer<typeof PracticeSummarySchema>;
