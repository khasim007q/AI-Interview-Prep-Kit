import type { Request, Response, NextFunction } from "express";
import { kitService } from "../services/kit.service.js";
import { practiceRepository } from "../repositories/practice.repository.js";
import { PracticeConfidenceSchema } from "@ai-interview-prep/shared";
import { z } from "zod";

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

const RecordAttemptSchema = z.object({
  flashcardId: z.string().min(1, "Flashcard ID is required"),
  confidence: PracticeConfidenceSchema,
});

export class PracticeController {
  async recordAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const { flashcardId, confidence } = RecordAttemptSchema.parse(req.body);

      // Verify kit access
      await kitService.getKit(kitId, userId);

      const attempt = await practiceRepository.recordAttempt({
        userId,
        kitId,
        flashcardId,
        confidence,
      });

      res.status(201).json({ attempt });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const kitDoc = await kitService.getKit(kitId, userId);
      const totalCards = kitDoc.kit?.flashcards.length || 0;

      const summary = await practiceRepository.getSummary(
        kitId,
        userId,
        totalCards
      );

      // Map weak flashcards back to requirement texts
      if (kitDoc.kit) {
        const weakCardIdSet = new Set(summary.weakFlashcardIds);
        const weakReqIdSet = new Set<string>();

        for (const card of kitDoc.kit.flashcards) {
          if (weakCardIdSet.has(card.id)) {
            for (const rId of card.requirement_ids) {
              weakReqIdSet.add(rId);
            }
          }
        }
        summary.weakRequirementIds = Array.from(weakReqIdSet);
      }

      res.status(200).json({ summary });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Returns flashcards sorted for practice:
   * 1. Lowest confidence first (weak spots)
   * 2. Never-attempted cards
   * 3. Oldest attempted cards
   */
  async getPracticeCards(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const kitId = getParam(req.params.kitId);
      const kitDoc = await kitService.getKit(kitId, userId);
      const cards = kitDoc.kit?.flashcards || [];

      const attempts = await practiceRepository.getAttemptsByKit(kitId, userId);

      const latestAttemptMap = new Map<string, { confidence: number; date: Date }>();
      for (const att of attempts) {
        if (!latestAttemptMap.has(att.flashcardId)) {
          latestAttemptMap.set(att.flashcardId, {
            confidence: att.confidence,
            date: att.createdAt,
          });
        }
      }

      const sortedCards = [...cards].sort((a, b) => {
        const attA = latestAttemptMap.get(a.id);
        const attB = latestAttemptMap.get(b.id);

        // Never attempted vs attempted: give never-attempted second priority after weak cards
        if (!attA && !attB) return 0;
        if (!attA) return attB!.confidence <= 2 ? 1 : -1;
        if (!attB) return attA.confidence <= 2 ? -1 : 1;

        // Both attempted: lowest confidence first
        if (attA.confidence !== attB.confidence) {
          return attA.confidence - attB.confidence;
        }

        // Tie-breaker: oldest attempted first
        return attA.date.getTime() - attB.date.getTime();
      });

      res.status(200).json({
        cards: sortedCards.map((c) => {
          const att = latestAttemptMap.get(c.id);
          return {
            ...c,
            lastConfidence: att?.confidence ?? null,
            lastAttemptedAt: att?.date.toISOString() ?? null,
          };
        }),
      });
    } catch (error) {
      next(error);
    }
  }
}

export const practiceController = new PracticeController();
