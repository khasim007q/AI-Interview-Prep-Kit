import { z } from "zod";

// Requirement Schema
export const RequirementKindSchema = z.enum(["technical", "behavioural", "domain"]);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const RequirementPrioritySchema = z.enum(["must", "nice"]);
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;

export const RequirementSchema = z.object({
  id: z.string().min(1, "Requirement ID must not be empty"),
  text: z.string().min(1, "Requirement text must not be empty"),
  kind: RequirementKindSchema,
  priority: RequirementPrioritySchema,
});
export type Requirement = z.infer<typeof RequirementSchema>;

// Internal Item Metadata for Builder & Regeneration Preservation
export const ItemMetadataSchema = z.object({
  origin: z.enum(["generated", "user"]).default("generated"),
  state: z.enum(["active", "deleted"]).optional().default("active"),
  pinned: z.boolean().default(false),
  edited: z.boolean().default(false),
  editedAt: z.string().optional(),
  revision: z.number().int().nonnegative().optional().default(0),
});
export type ItemMetadata = z.infer<typeof ItemMetadataSchema>;

// Question Schema
export const QuestionCategorySchema = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

export const QuestionDifficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type QuestionDifficulty = z.infer<typeof QuestionDifficultySchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1, "Question ID must not be empty"),
  requirement_ids: z.array(z.string()).default([]),
  category: QuestionCategorySchema,
  prompt: z.string().min(1, "Prompt must not be empty"),
  answer_outline: z.string().min(1, "Answer outline must not be empty"),
  difficulty: QuestionDifficultySchema,
  metadata: ItemMetadataSchema.optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// Flashcard Schema
export const FlashcardSchema = z.object({
  id: z.string().min(1, "Flashcard ID must not be empty"),
  front: z.string().min(1, "Flashcard front must not be empty"),
  back: z.string().min(1, "Flashcard back must not be empty"),
  requirement_ids: z.array(z.string()).default([]),
  metadata: ItemMetadataSchema.optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

// Schedule Schema
export const ScheduleDaySchema = z.object({
  day: z.number().int().positive("Day number must be a positive integer"),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative("Minutes must be a non-negative integer"),
});
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;

export const ScheduleSchema = z.object({
  days_available: z.number().int().positive("Days available must be a positive integer"),
  days: z.array(ScheduleDaySchema),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// Source Schema
export const SourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string().default(""),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});
export type Source = z.infer<typeof SourceSchema>;

// Company Brief Schema
export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;

// Role Schema
export const RoleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(RequirementSchema).default([]),
});
export type Role = z.infer<typeof RoleSchema>;

// Coverage Schema
export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

// Research Failure & Evidence Schema
export const ResearchSourceFailedSchema = z.object({
  url: z.string(),
  reason: z.string(),
});
export type ResearchSourceFailed = z.infer<typeof ResearchSourceFailedSchema>;

export const ResearchMetadataSchema = z.object({
  sources_attempted: z.array(z.string()).default([]),
  sources_used: z.array(z.string()).default([]),
  sources_failed: z.array(ResearchSourceFailedSchema).default([]),
  public_discussion: z.object({
    found: z.boolean().default(false),
    sources: z.array(z.string()).default([]),
  }).default({ found: false, sources: [] }),
  hiring_page_found: z.boolean().default(false),
  pages_content: z.array(z.object({
    url: z.string(),
    title: z.string().default(""),
    content: z.string(),
  })).default([]),
  discussion_content: z.array(z.object({
    source: z.string(),
    snippet: z.string(),
  })).default([]),
});
export type ResearchMetadata = z.infer<typeof ResearchMetadataSchema>;

// Canonical Public Kit Schema (Appendix A compliant with optional research & metadata extensions)
export const KitSchema = z.object({
  source: SourceSchema,
  company_brief: CompanyBriefSchema,
  role: RoleSchema,
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: ScheduleSchema,
  coverage: CoverageSchema,
  research: ResearchMetadataSchema.optional(),
});
export type Kit = z.infer<typeof KitSchema>;

// Backward compatibility alias
export const QuestionWithMetadataSchema = QuestionSchema;
export type QuestionWithMetadata = Question;

export const FlashcardWithMetadataSchema = FlashcardSchema;
export type FlashcardWithMetadata = Flashcard;
