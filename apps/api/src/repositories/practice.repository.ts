import { ObjectId } from "mongodb";
import { getDatabase } from "./db.js";
import type { PracticeConfidence, PracticeSummary } from "@ai-interview-prep/shared";

export interface PracticeAttemptDoc {
  _id: ObjectId;
  userId: ObjectId;
  kitId: ObjectId;
  flashcardId: string;
  confidence: PracticeConfidence;
  createdAt: Date;
}

export class PracticeRepository {
  private get collection() {
    return getDatabase().collection<PracticeAttemptDoc>("practice_attempts");
  }

  async recordAttempt(data: {
    userId: string | ObjectId;
    kitId: string | ObjectId;
    flashcardId: string;
    confidence: PracticeConfidence;
  }): Promise<PracticeAttemptDoc> {
    const userObjId =
      typeof data.userId === "string" ? new ObjectId(data.userId) : data.userId;
    const kitObjId =
      typeof data.kitId === "string" ? new ObjectId(data.kitId) : data.kitId;

    const doc: Omit<PracticeAttemptDoc, "_id"> = {
      userId: userObjId,
      kitId: kitObjId,
      flashcardId: data.flashcardId,
      confidence: data.confidence,
      createdAt: new Date(),
    };

    const result = await this.collection.insertOne(doc as PracticeAttemptDoc);
    return {
      _id: result.insertedId,
      ...doc,
    };
  }

  async getAttemptsByKit(
    kitId: string | ObjectId,
    userId: string | ObjectId
  ): Promise<PracticeAttemptDoc[]> {
    const userObjId =
      typeof userId === "string" ? new ObjectId(userId) : userId;
    const kitObjId =
      typeof kitId === "string" ? new ObjectId(kitId) : kitId;

    return this.collection
      .find({ kitId: kitObjId, userId: userObjId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Generates a practice summary and identifies weak spots (confidence <= 2).
   */
  async getSummary(
    kitId: string | ObjectId,
    userId: string | ObjectId,
    totalFlashcardsCount: number
  ): Promise<PracticeSummary> {
    const attempts = await this.getAttemptsByKit(kitId, userId);

    // Keep latest attempt per flashcard
    const latestAttemptMap = new Map<string, PracticeConfidence>();
    const distribution: Record<string, number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
    };

    for (const attempt of attempts) {
      if (!latestAttemptMap.has(attempt.flashcardId)) {
        latestAttemptMap.set(attempt.flashcardId, attempt.confidence);
        distribution[attempt.confidence.toString()] =
          (distribution[attempt.confidence.toString()] || 0) + 1;
      }
    }

    const weakFlashcardIds: string[] = [];
    let confidenceSum = 0;

    for (const [flashcardId, conf] of latestAttemptMap.entries()) {
      confidenceSum += conf;
      if (conf <= 2) {
        weakFlashcardIds.push(flashcardId);
      }
    }

    const attemptedCount = latestAttemptMap.size;
    const averageConfidence =
      attemptedCount > 0 ? Number((confidenceSum / attemptedCount).toFixed(2)) : 0;

    return {
      kitId: typeof kitId === "string" ? kitId : kitId.toString(),
      totalFlashcards: totalFlashcardsCount,
      attemptedCount,
      averageConfidence,
      confidenceDistribution: distribution,
      weakFlashcardIds,
      weakRequirementIds: [],
    };
  }
}

export const practiceRepository = new PracticeRepository();
