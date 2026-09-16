import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { kitService } from "../services/kit.service.js";
import {
  KitSchema,
  QuestionSchema,
  FlashcardSchema,
  QuestionCategorySchema,
} from "@ai-interview-prep/shared";

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

const CreateKitInputSchema = z.object({
  jd: z.string().min(1, "Job description is required"),
  company_url: z.string().min(1, "Company URL is required"),
  days: z.coerce.number().int().min(1).max(60).default(5),
});

const UpdateKitInputSchema = z.object({
  version: z.number().int().positive("Version is required for concurrency control"),
  kit: KitSchema,
});

const ReorderQuestionsInputSchema = z.object({
  questionIds: z.array(z.string()).min(1, "Question IDs list is required"),
});

export class KitController {
  async createKit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = CreateKitInputSchema.parse(req.body);
      const userId = req.user!.id;

      const kitDoc = await kitService.createKitJob(userId, input);

      res.status(202).json({
        id: kitDoc._id.toString(),
        status: kitDoc.status,
        generation: kitDoc.generation,
      });
    } catch (error) {
      next(error);
    }
  }

  async listKits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kits = await kitService.listKits(userId);
      res.status(200).json({
        kits: kits.map((k) => ({
          id: k._id.toString(),
          status: k.status,
          company: k.kit?.source.company || "Pending",
          role: k.kit?.role.title || "Pending",
          days_available: k.kit?.schedule.days_available || k.input.days,
          createdAt: k.createdAt.toISOString(),
          updatedAt: k.updatedAt.toISOString(),
          generation: k.generation,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async getKit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const kitDoc = await kitService.getKit(kitId, userId);

      res.status(200).json({
        id: kitDoc._id.toString(),
        status: kitDoc.status,
        input: kitDoc.input,
        kit: kitDoc.kit,
        generation: kitDoc.generation,
        version: kitDoc.version,
        createdAt: kitDoc.createdAt.toISOString(),
        updatedAt: kitDoc.updatedAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  async getGenerationStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const kitDoc = await kitService.getKit(kitId, userId);

      res.status(200).json({
        status: kitDoc.status,
        generation: kitDoc.generation,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateKit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const { version, kit } = UpdateKitInputSchema.parse(req.body);

      const updated = await kitService.updateKit(kitId, userId, version, kit);

      res.status(200).json({
        id: updated._id.toString(),
        kit: updated.kit,
        version: updated.version,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteKit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      await kitService.deleteKit(kitId, userId);
      res.status(200).json({ message: "Kit deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  // --------------------------------------------------------------------------
  // Questions
  // --------------------------------------------------------------------------

  async addQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const question = QuestionSchema.parse(req.body);
      const updated = await kitService.addQuestion(kitId, userId, question);
      res.status(201).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  async updateQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const questionId = getParam(req.params.questionId);
      const patch = QuestionSchema.partial().parse(req.body);
      const updated = await kitService.updateQuestion(kitId, userId, questionId, patch);
      res.status(200).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  async deleteQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const questionId = getParam(req.params.questionId);
      const updated = await kitService.deleteQuestion(kitId, userId, questionId);
      res.status(200).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  async reorderQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const { questionIds } = ReorderQuestionsInputSchema.parse(req.body);
      const updated = await kitService.reorderQuestions(kitId, userId, questionIds);
      res.status(200).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  // --------------------------------------------------------------------------
  // Flashcards
  // --------------------------------------------------------------------------

  async addFlashcard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const flashcard = FlashcardSchema.parse(req.body);
      const updated = await kitService.addFlashcard(kitId, userId, flashcard);
      res.status(201).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  async updateFlashcard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const flashcardId = getParam(req.params.flashcardId);
      const patch = FlashcardSchema.partial().parse(req.body);
      const updated = await kitService.updateFlashcard(kitId, userId, flashcardId, patch);
      res.status(200).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  async deleteFlashcard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const flashcardId = getParam(req.params.flashcardId);
      const updated = await kitService.deleteFlashcard(kitId, userId, flashcardId);
      res.status(200).json({ kit: updated.kit, version: updated.version });
    } catch (error) {
      next(error);
    }
  }

  // --------------------------------------------------------------------------
  // Regeneration
  // --------------------------------------------------------------------------

  async regenerateCompanyBrief(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const updated = await kitService.regenerateCompanyBrief(kitId, userId);
      res.status(200).json({
        message: "Company brief regenerated successfully",
        kit: updated.kit,
        version: updated.version,
      });
    } catch (error) {
      next(error);
    }
  }

  async regenerateCategoryQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const category = QuestionCategorySchema.parse(getParam(req.params.category));
      const result = await kitService.regenerateCategoryQuestions(kitId, userId, category);

      res.status(200).json({
        message: `Regenerated ${category} questions. Preserved ${result.preservedCount} user-edited/pinned questions, added ${result.newCount} new questions.`,
        preservedCount: result.preservedCount,
        newCount: result.newCount,
        kit: result.kitDoc.kit,
        version: result.kitDoc.version,
      });
    } catch (error) {
      next(error);
    }
  }

  async regenerateSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const updated = await kitService.regenerateSchedule(kitId, userId);
      res.status(200).json({
        message: "Schedule recalculated successfully",
        kit: updated.kit,
        version: updated.version,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const kitController = new KitController();
