import { ObjectId } from "mongodb";
import { kitRepository, type KitDoc, type GenerationStatus } from "../repositories/kit.repository.js";
import { runGenerationPipeline, type GenerationInput } from "../pipeline/orchestrator.js";
import { sha256 } from "../utils/hash.js";
import { normalizeJobDescription } from "../deterministic/jd-normalizer.js";
import { checkRequirementCoverage } from "../deterministic/coverage-checker.js";
import { allocateSchedule } from "../deterministic/scheduler.js";
import { validateKitStructure } from "../deterministic/structure-validator.js";
import { defaultLLMProvider, type LLMProvider } from "../ai/llm-client.js";
import {
  buildCompanyBriefPrompt,
  CompanyBriefOutputSchema,
} from "../ai/prompts/company-brief.prompt.js";
import {
  buildCategoryQuestionsPrompt,
  CategoryQuestionsOutputSchema,
  type CategoryQuestionsOutput,
} from "../ai/prompts/generate-questions.prompt.js";
import { AppError } from "../middleware/error.middleware.js";
import { logger } from "../utils/logger.js";
import type {
  Kit,
  Question,
  Flashcard,
  QuestionCategory,
  CompanyBrief,
} from "@ai-interview-prep/shared";

export class KitService {
  /**
   * Creates a kit generation record and triggers async processing.
   */
  async createKitJob(
    userId: string,
    input: GenerationInput,
    options: { llmProvider?: LLMProvider; runSynchronously?: boolean } = {}
  ): Promise<KitDoc> {
    const normalizedJd = normalizeJobDescription(input.jd);
    const normalizedUrl = input.company_url.trim().toLowerCase();
    const safeDays = Math.min(60, Math.max(1, Math.floor(input.days)));

    const inputHash = sha256(`${normalizedJd.text}::${normalizedUrl}::${safeDays}`);

    // Check duplicate submission
    const existing = await kitRepository.findExistingCompleted(userId, inputHash);
    if (existing && existing.kit) {
      logger.info({ kitId: existing._id }, "Returning existing completed kit for identical input");
      return existing;
    }

    const kitDoc = await kitRepository.create({
      userId,
      input: {
        jd: input.jd,
        company_url: input.company_url,
        days: safeDays,
      },
      inputHash,
      status: "running",
    });

    const runner = async () => {
      try {
        await kitRepository.updateGenerationProgress(kitDoc._id, {
          status: "running",
          stage: "starting",
          progress: 5,
          message: "Starting research and analysis pipeline",
          startedAt: new Date(),
        });

        const generatedKit = await runGenerationPipeline(
          {
            jd: input.jd,
            company_url: input.company_url,
            days: safeDays,
          },
          {
            llmProvider: options.llmProvider || defaultLLMProvider,
            onProgress: async (stage, progress, message) => {
              await kitRepository.updateGenerationProgress(kitDoc._id, {
                status: "running",
                stage,
                progress,
                message,
              });
            },
          }
        );

        await kitRepository.saveCompletedKit(kitDoc._id, generatedKit);
        logger.info({ kitId: kitDoc._id }, "Background kit generation finished successfully");
      } catch (err: unknown) {
        logger.error({ kitId: kitDoc._id, err }, "Kit generation job failed");
        const appErr = err as AppError;
        await kitRepository.updateGenerationProgress(kitDoc._id, {
          status: "failed",
          stage: "failed",
          progress: 0,
          message: appErr.message || "Kit generation failed",
          error: {
            code: appErr.code || "GENERATION_FAILED",
            message: appErr.message || "An error occurred during generation",
          },
          completedAt: new Date(),
        });
      }
    };

    if (options.runSynchronously) {
      await runner();
      const updated = await kitRepository.findById(kitDoc._id);
      return updated || kitDoc;
    } else {
      // Execute asynchronously in background
      setImmediate(runner);
      return kitDoc;
    }
  }

  async getKit(kitId: string, userId: string): Promise<KitDoc> {
    const doc = await kitRepository.findByIdAndUserId(kitId, userId);
    if (!doc) {
      throw new AppError(404, "KIT_NOT_FOUND", "Kit not found or access unauthorized");
    }
    return doc;
  }

  async listKits(userId: string): Promise<KitDoc[]> {
    return kitRepository.findByUserId(userId);
  }

  async deleteKit(kitId: string, userId: string): Promise<boolean> {
    const deleted = await kitRepository.delete(kitId, userId);
    if (!deleted) {
      throw new AppError(404, "KIT_NOT_FOUND", "Kit not found or access unauthorized");
    }
    return true;
  }

  /**
   * Applies full kit update with optimistic version checking.
   */
  async updateKit(
    kitId: string,
    userId: string,
    expectedVersion: number,
    updatedKit: Kit
  ): Promise<KitDoc> {
    // Validate semantic integrity
    const validation = validateKitStructure(updatedKit, { requireMustCoverage: false });
    if (!validation.isValid) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Kit structure invalid: ${validation.errors.join("; ")}`
      );
    }

    const updated = await kitRepository.updateWithVersionLock(
      kitId,
      userId,
      expectedVersion,
      updatedKit
    );

    if (!updated) {
      throw new AppError(
        409,
        "KIT_VERSION_CONFLICT",
        "The kit was modified by another session. Please reload the latest changes."
      );
    }

    return updated;
  }

  // --------------------------------------------------------------------------
  // Granular Question Operations
  // --------------------------------------------------------------------------

  async addQuestion(kitId: string, userId: string, question: Question): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    // Ensure unique ID
    if (kit.questions.some((q) => q.id === question.id)) {
      question.id = `q_${Date.now()}`;
    }

    kit.questions.push(question);

    // Re-evaluate coverage and schedule
    const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
    kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;

    return this.updateKit(kitId, userId, doc.version, kit);
  }

  async updateQuestion(
    kitId: string,
    userId: string,
    questionId: string,
    patch: Partial<Question>
  ): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    const qIndex = kit.questions.findIndex((q) => q.id === questionId);
    if (qIndex === -1) {
      throw new AppError(404, "QUESTION_NOT_FOUND", `Question '${questionId}' not found`);
    }

    kit.questions[qIndex] = {
      ...kit.questions[qIndex],
      ...patch,
      id: questionId, // id is immutable
    };

    const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
    kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;

    return this.updateKit(kitId, userId, doc.version, kit);
  }

  async deleteQuestion(kitId: string, userId: string, questionId: string): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    const initialLen = kit.questions.length;
    kit.questions = kit.questions.filter((q) => q.id !== questionId);

    if (kit.questions.length === initialLen) {
      throw new AppError(404, "QUESTION_NOT_FOUND", `Question '${questionId}' not found`);
    }

    // Remove from schedule references
    for (const day of kit.schedule.days) {
      day.question_ids = day.question_ids.filter((id) => id !== questionId);
    }

    const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
    kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;

    return this.updateKit(kitId, userId, doc.version, kit);
  }

  async reorderQuestions(
    kitId: string,
    userId: string,
    orderedQuestionIds: string[]
  ): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    const questionMap = new Map(kit.questions.map((q) => [q.id, q]));

    const reordered: Question[] = [];
    for (const id of orderedQuestionIds) {
      const q = questionMap.get(id);
      if (q) {
        reordered.push(q);
        questionMap.delete(id);
      }
    }

    // Append any remaining questions not mentioned in the ordered list
    for (const remaining of questionMap.values()) {
      reordered.push(remaining);
    }

    kit.questions = reordered;
    return this.updateKit(kitId, userId, doc.version, kit);
  }

  // --------------------------------------------------------------------------
  // Granular Flashcard Operations
  // --------------------------------------------------------------------------

  async addFlashcard(kitId: string, userId: string, flashcard: Flashcard): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    if (kit.flashcards.some((f) => f.id === flashcard.id)) {
      flashcard.id = `f_${Date.now()}`;
    }
    kit.flashcards.push(flashcard);
    return this.updateKit(kitId, userId, doc.version, kit);
  }

  async updateFlashcard(
    kitId: string,
    userId: string,
    flashcardId: string,
    patch: Partial<Flashcard>
  ): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    const fIndex = kit.flashcards.findIndex((f) => f.id === flashcardId);
    if (fIndex === -1) {
      throw new AppError(404, "FLASHCARD_NOT_FOUND", `Flashcard '${flashcardId}' not found`);
    }

    kit.flashcards[fIndex] = {
      ...kit.flashcards[fIndex],
      ...patch,
      id: flashcardId,
    };
    return this.updateKit(kitId, userId, doc.version, kit);
  }

  async deleteFlashcard(kitId: string, userId: string, flashcardId: string): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    kit.flashcards = kit.flashcards.filter((f) => f.id !== flashcardId);
    return this.updateKit(kitId, userId, doc.version, kit);
  }

  // --------------------------------------------------------------------------
  // Section Regeneration (Preserving User Edits)
  // --------------------------------------------------------------------------

  /**
   * Regenerates only the company brief.
   */
  async regenerateCompanyBrief(
    kitId: string,
    userId: string,
    llm: LLMProvider = defaultLLMProvider
  ): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    const briefPrompt = buildCompanyBriefPrompt(
      kit.source.company,
      [], // Use existing sources for reference
      []
    );

    const newBrief = await llm.generateStructured<CompanyBrief>(
      briefPrompt,
      CompanyBriefOutputSchema
    );

    kit.company_brief = {
      ...newBrief,
      sources: kit.company_brief.sources.length > 0 ? kit.company_brief.sources : newBrief.sources,
    };

    return this.updateKit(kitId, userId, doc.version, kit);
  }

  /**
   * Regenerates questions for a single category, preserving user edits and pinned questions.
   */
  async regenerateCategoryQuestions(
    kitId: string,
    userId: string,
    category: QuestionCategory,
    llm: LLMProvider = defaultLLMProvider
  ): Promise<{ kitDoc: KitDoc; preservedCount: number; newCount: number }> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;

    // Separate preserved vs replaceable questions in this category
    // Spec §26 & Master Prompt §17:
    // Retain questions that were pinned, edited, or user-created
    const preservedInOtherCategories = kit.questions.filter((q) => q.category !== category);
    const categoryQuestions = kit.questions.filter((q) => q.category === category);

    // Any question with custom metadata or user changes is preserved
    const preservedQuestions: Question[] = [];
    for (const q of categoryQuestions) {
      // Check if question has metadata.pinned or is user origin
      const qWithMeta = q as Question & { metadata?: { pinned?: boolean; origin?: string } };
      if (qWithMeta.metadata?.pinned || qWithMeta.metadata?.origin === "user") {
        preservedQuestions.push(q);
      }
    }

    const preservedCount = preservedQuestions.length;

    // Filter relevant requirements
    let categoryReqs = kit.role.requirements;
    if (category === "technical") {
      categoryReqs = kit.role.requirements.filter((r) => r.kind === "technical" || r.kind === "domain");
    } else if (category === "behavioural") {
      categoryReqs = kit.role.requirements.filter((r) => r.kind === "behavioural" || r.priority === "must");
    } else if (category === "system-design") {
      categoryReqs = kit.role.requirements.filter((r) => r.kind === "technical");
    }
    if (categoryReqs.length === 0) categoryReqs = kit.role.requirements;

    // Generate fresh replacement questions
    const qPrompt = buildCategoryQuestionsPrompt({
      category,
      requirements: categoryReqs,
      roleTitle: kit.role.title,
      seniority: kit.role.seniority,
      companyName: kit.source.company,
      companySummary: kit.company_brief.summary,
      startQuestionNumber: Date.now() % 1000,
    });

    const qResult = await llm.generateStructured<CategoryQuestionsOutput>(
      qPrompt,
      CategoryQuestionsOutputSchema
    );

    const newQuestions = qResult.questions.map((q, idx) => ({
      ...q,
      id: `q_reg_${category}_${idx + 1}`,
      category,
    }));

    // Merge: preserved from other categories + preserved in this category + new questions
    kit.questions = [
      ...preservedInOtherCategories,
      ...preservedQuestions,
      ...newQuestions,
    ];

    // Re-run deterministic coverage & scheduler
    const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
    kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
    kit.coverage.passes += 1;

    kit.schedule = allocateSchedule(kit.schedule.days_available, kit.questions, kit.role.requirements);

    const updatedDoc = await this.updateKit(kitId, userId, doc.version, kit);
    return {
      kitDoc: updatedDoc,
      preservedCount,
      newCount: newQuestions.length,
    };
  }

  /**
   * Deterministically recalculates schedule allocation from the latest question bank.
   */
  async regenerateSchedule(kitId: string, userId: string): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;
    kit.schedule = allocateSchedule(kit.schedule.days_available, kit.questions, kit.role.requirements);

    return this.updateKit(kitId, userId, doc.version, kit);
  }
}

export const kitService = new KitService();
