import { ObjectId } from "mongodb";
import { kitRepository, type KitDoc, type GenerationStatus } from "../repositories/kit.repository.js";
import { runGenerationPipeline, globalPipelineLlmLimiter, type GenerationInput } from "../pipeline/orchestrator.js";
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
import type { SearchResultItem } from "../research/search-provider.js";
import type {
  Kit,
  Question,
  Flashcard,
  QuestionCategory,
  CompanyBrief,
} from "@ai-interview-prep/shared";

// In-process active generation AbortControllers by kitId
const activeGenerations = new Map<string, AbortController>();

export class KitService {
  /**
   * Creates a kit generation record and triggers async processing.
   * Prevents duplicate in-flight jobs and returns existing completed kits.
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

    // Check duplicate or in-flight submission
    const existing = await kitRepository.findActiveOrCompleted(userId, inputHash);
    if (existing) {
      if (existing.status === "completed" && existing.kit) {
        logger.info({ kitId: existing._id }, "Returning existing completed kit for identical input");
        return existing;
      }
      if (existing.status === "running" || existing.status === "queued") {
        logger.info({ kitId: existing._id }, "Returning in-flight kit generation job for identical input");
        return existing;
      }
    }

    let kitDoc: KitDoc;
    try {
      kitDoc = await kitRepository.create({
        userId,
        input: {
          jd: input.jd,
          company_url: input.company_url,
          days: safeDays,
        },
        inputHash,
        status: "running",
      });
    } catch (err: unknown) {
      // Handle MongoDB E11000 duplicate key collision for concurrent active jobs
      const isDuplicate =
        (err as { code?: number })?.code === 11000 ||
        ((err as Error)?.message || "").includes("E11000");
      if (isDuplicate) {
        logger.info(
          { userId, inputHash },
          "Concurrent active job detected via unique index; returning active job"
        );
        const active = await kitRepository.findActiveOrCompleted(userId, inputHash);
        if (active) return active;
      }
      throw err;
    }

    const abortController = new AbortController();
    activeGenerations.set(kitDoc._id.toString(), abortController);

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
            signal: abortController.signal,
            onProgress: async (stage, progress, message) => {
              if (abortController.signal.aborted) return;
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
        const appErr = err as AppError;
        const isCancelled =
          abortController.signal.aborted ||
          appErr?.code === "GENERATION_CANCELLED" ||
          (err as Error)?.name === "AbortError";

        if (isCancelled) {
          logger.info({ kitId: kitDoc._id }, "Kit generation job was cancelled");
          await kitRepository.updateGenerationProgress(kitDoc._id, {
            status: "cancelled",
            stage: "failed",
            progress: 0,
            message: "Kit generation was cancelled",
            completedAt: new Date(),
          });
        } else {
          logger.error({ kitId: kitDoc._id, err }, "Kit generation job failed");
          await kitRepository.updateGenerationProgress(kitDoc._id, {
            status: "failed",
            stage: "failed",
            progress: 0,
            message: appErr.message || "Kit generation failed",
            error: {
              code: appErr.code || "GENERATION_FAILED",
              message: appErr.message || "An error occurred during generation",
              details: appErr.details,
            },
            completedAt: new Date(),
          });
        }
      } finally {
        activeGenerations.delete(kitDoc._id.toString());
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

  /**
   * Returns lightweight generation status using MongoDB projection.
   * Invariant: Strictly read-only; never invokes LLM, crawler, search, or pipeline.
   */
  async getGenerationStatus(kitId: string, userId: string) {
    const doc = await kitRepository.findGenerationStatus(kitId, userId);
    if (!doc) {
      throw new AppError(404, "KIT_NOT_FOUND", "Kit not found or access unauthorized");
    }

    return {
      id: doc._id.toString(),
      status: doc.status,
      stage: doc.generation?.stage || "starting",
      progress: doc.generation?.progress ?? 0,
      message: doc.generation?.message || "",
      error: doc.generation?.error || null,
      generation: doc.generation,
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async listKits(userId: string): Promise<KitDoc[]> {
    return kitRepository.findByUserId(userId);
  }

  async cancelKitGeneration(kitId: string, userId: string): Promise<KitDoc> {
    const kitDoc = await this.getKit(kitId, userId);
    if (kitDoc.status !== "running" && kitDoc.status !== "queued") {
      throw new AppError(400, "INVALID_STATE", `Cannot cancel kit with status: ${kitDoc.status}`);
    }

    const controller = activeGenerations.get(kitId);
    if (controller) {
      controller.abort();
      activeGenerations.delete(kitId);
    }

    await kitRepository.updateGenerationProgress(kitDoc._id, {
      status: "cancelled",
      stage: "failed",
      progress: 0,
      message: "Generation cancelled by user",
      completedAt: new Date(),
    });

    const updated = await kitRepository.findById(kitId);
    return updated || kitDoc;
  }

  async deleteKit(kitId: string, userId: string): Promise<boolean> {
    const controller = activeGenerations.get(kitId);
    if (controller) {
      controller.abort();
      activeGenerations.delete(kitId);
    }
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
  // Granular Question Operations with Conflict Retry
  // --------------------------------------------------------------------------

  private async executeWithConflictRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (
          err instanceof AppError &&
          err.code === "KIT_VERSION_CONFLICT" &&
          attempt < maxRetries
        ) {
          logger.warn(
            { attempt, maxRetries },
            "Kit version conflict detected; retrying with refreshed state"
          );
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * Math.pow(2, attempt) + Math.random() * 25)
          );
          continue;
        }
        throw err;
      }
    }
    throw new AppError(
      409,
      "KIT_VERSION_CONFLICT",
      "The kit was modified by another session. Please reload the latest changes."
    );
  }

  async addQuestion(kitId: string, userId: string, question: Question): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
      const doc = await this.getKit(kitId, userId);
      if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

      const kit = doc.kit;
      // Ensure unique ID
      if (kit.questions.some((q) => q.id === question.id)) {
        question.id = `q_${Date.now()}`;
      }

      question.metadata = {
        origin: "user",
        edited: false,
        pinned: false,
        state: "active",
        revision: 1,
        ...question.metadata,
      };

      kit.questions.push(question);

      // Re-evaluate coverage and schedule
      const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
      kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
      kit.schedule = allocateSchedule(kit.schedule.days_available, kit.questions, kit.role.requirements);

      return this.updateKit(kitId, userId, doc.version, kit);
    });
  }

  async updateQuestion(
    kitId: string,
    userId: string,
    questionId: string,
    patch: Partial<Question>
  ): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
      const doc = await this.getKit(kitId, userId);
      if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

      const kit = doc.kit;
      const qIndex = kit.questions.findIndex((q) => q.id === questionId);
      if (qIndex === -1) {
        throw new AppError(404, "QUESTION_NOT_FOUND", `Question '${questionId}' not found`);
      }

      const currentMeta = kit.questions[qIndex].metadata || {
        origin: "generated",
        edited: false,
        pinned: false,
        state: "active",
        revision: 0,
      };

      const newMeta = {
        ...currentMeta,
        origin: "user" as const,
        edited: true,
        editedAt: new Date().toISOString(),
        pinned:
          patch.metadata?.pinned !== undefined ? patch.metadata.pinned : currentMeta.pinned ?? false,
        state: currentMeta.state || "active",
        revision: (currentMeta.revision || 0) + 1,
      };

      kit.questions[qIndex] = {
        ...kit.questions[qIndex],
        ...patch,
        id: questionId, // id is immutable
        metadata: newMeta,
      };

      // Re-evaluate coverage and schedule
      const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
      kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
      kit.schedule = allocateSchedule(kit.schedule.days_available, kit.questions, kit.role.requirements);

      return this.updateKit(kitId, userId, doc.version, kit);
    });
  }

  async deleteQuestion(kitId: string, userId: string, questionId: string): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
      const doc = await this.getKit(kitId, userId);
      if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

      const kit = doc.kit;
      const initialLen = kit.questions.length;
      kit.questions = kit.questions.filter((q) => q.id !== questionId);

      if (kit.questions.length === initialLen) {
        throw new AppError(404, "QUESTION_NOT_FOUND", `Question '${questionId}' not found`);
      }

      // Re-evaluate coverage and schedule
      const coverage = checkRequirementCoverage(kit.role.requirements, kit.questions);
      kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
      kit.schedule = allocateSchedule(kit.schedule.days_available, kit.questions, kit.role.requirements);

      return this.updateKit(kitId, userId, doc.version, kit);
    });
  }

  async reorderQuestions(
    kitId: string,
    userId: string,
    orderedQuestionIds: string[]
  ): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
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
    });
  }

  // --------------------------------------------------------------------------
  // Granular Flashcard Operations
  // --------------------------------------------------------------------------

  async addFlashcard(kitId: string, userId: string, flashcard: Flashcard): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
      const doc = await this.getKit(kitId, userId);
      if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

      const kit = doc.kit;
      if (kit.flashcards.some((f) => f.id === flashcard.id)) {
        flashcard.id = `f_${Date.now()}`;
      }

      flashcard.metadata = {
        origin: "user",
        edited: false,
        pinned: false,
        state: "active",
        revision: 1,
        ...flashcard.metadata,
      };

      kit.flashcards.push(flashcard);
      return this.updateKit(kitId, userId, doc.version, kit);
    });
  }

  async updateFlashcard(
    kitId: string,
    userId: string,
    flashcardId: string,
    patch: Partial<Flashcard>
  ): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
      const doc = await this.getKit(kitId, userId);
      if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

      const kit = doc.kit;
      const fIndex = kit.flashcards.findIndex((f) => f.id === flashcardId);
      if (fIndex === -1) {
        throw new AppError(404, "FLASHCARD_NOT_FOUND", `Flashcard '${flashcardId}' not found`);
      }

      const currentMeta = kit.flashcards[fIndex].metadata || {
        origin: "generated",
        edited: false,
        pinned: false,
        state: "active",
        revision: 0,
      };

      const newMeta = {
        ...currentMeta,
        origin: "user" as const,
        edited: true,
        editedAt: new Date().toISOString(),
        pinned:
          patch.metadata?.pinned !== undefined ? patch.metadata.pinned : currentMeta.pinned ?? false,
        state: currentMeta.state || "active",
        revision: (currentMeta.revision || 0) + 1,
      };

      kit.flashcards[fIndex] = {
        ...kit.flashcards[fIndex],
        ...patch,
        id: flashcardId,
        metadata: newMeta,
      };
      return this.updateKit(kitId, userId, doc.version, kit);
    });
  }

  async deleteFlashcard(kitId: string, userId: string, flashcardId: string): Promise<KitDoc> {
    return this.executeWithConflictRetry(async () => {
      const doc = await this.getKit(kitId, userId);
      if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

      const kit = doc.kit;
      kit.flashcards = kit.flashcards.filter((f) => f.id !== flashcardId);
      return this.updateKit(kitId, userId, doc.version, kit);
    });
  }

  // --------------------------------------------------------------------------
  // Section Regeneration (Preserving User Edits & Grounded in Saved Research)
  // --------------------------------------------------------------------------

  /**
   * Regenerates only the company brief, strictly grounded in the saved research evidence.
   */
  async regenerateCompanyBrief(
    kitId: string,
    userId: string,
    llm: LLMProvider = defaultLLMProvider
  ): Promise<KitDoc> {
    const doc = await this.getKit(kitId, userId);
    if (!doc.kit) throw new AppError(400, "KIT_NOT_READY", "Kit has not finished generating");

    const kit = doc.kit;

    // Ground regeneration in saved research snapshot
    const crawlPages = (kit.research?.pages_content || []).map((p) => ({
      url: p.url,
      title: p.title || "",
      text: p.content,
      sourceType: "company" as const,
      retrievedAt: new Date().toISOString(),
      status: "ok" as const,
    }));

    const discussionFindings: SearchResultItem[] = (
      kit.research?.discussion_content || []
    ).map((d) => ({
      url: d.source,
      title: "",
      snippet: d.snippet,
      sourceType: "public-discussion" as const,
    }));

    const briefPrompt = buildCompanyBriefPrompt(
      kit.source.company,
      crawlPages,
      discussionFindings
    );

    const newBrief = await globalPipelineLlmLimiter(() =>
      llm.generateStructured<CompanyBrief>(
        briefPrompt,
        CompanyBriefOutputSchema
      )
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

    // Any question with custom metadata, pinned, edited, or user origin is preserved
    const preservedQuestions: Question[] = [];
    for (const q of categoryQuestions) {
      if (q.metadata?.pinned || q.metadata?.edited || q.metadata?.origin === "user") {
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

    const qResult = await globalPipelineLlmLimiter(() =>
      llm.generateStructured<CategoryQuestionsOutput>(
        qPrompt,
        CategoryQuestionsOutputSchema
      )
    );

    const newQuestions = qResult.questions.map((q, idx) => ({
      ...q,
      id: `q_reg_${category}_${idx + 1}`,
      category,
      requirement_ids: q.requirement_ids.filter((id) =>
        kit.role.requirements.some((r) => r.id === id)
      ),
      metadata: {
        origin: "generated" as const,
        edited: false,
        pinned: false,
        state: "active" as const,
        revision: 0,
      },
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
