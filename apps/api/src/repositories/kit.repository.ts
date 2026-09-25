import { ObjectId } from "mongodb";
import { getDatabase } from "./db.js";
import type { Kit } from "@ai-interview-prep/shared";

export type GenerationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface GenerationMetadata {
  status: GenerationStatus;
  stage: string;
  progress: number;
  message?: string;
  error?: { code: string; message: string; details?: unknown } | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface KitDoc {
  _id: ObjectId;
  userId: ObjectId;
  status: GenerationStatus;
  input: {
    jd: string;
    company_url: string;
    days: number;
  };
  inputHash: string;
  kit: Kit | null;
  generation: GenerationMetadata;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class KitRepository {
  private get collection() {
    return getDatabase().collection<KitDoc>("kits");
  }

  async create(data: {
    userId: string | ObjectId;
    input: { jd: string; company_url: string; days: number };
    inputHash: string;
    kit?: Kit | null;
    status?: GenerationStatus;
  }): Promise<KitDoc> {
    const now = new Date();
    const userObjId =
      typeof data.userId === "string" ? new ObjectId(data.userId) : data.userId;

    const doc: Omit<KitDoc, "_id"> = {
      userId: userObjId,
      status: data.status || "queued",
      input: data.input,
      inputHash: data.inputHash,
      kit: data.kit || null,
      generation: {
        status: data.status || "queued",
        stage: "queued",
        progress: 0,
        message: "Generation queued",
        error: null,
        startedAt: null,
        completedAt: null,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(doc as KitDoc);
    return {
      _id: result.insertedId,
      ...doc,
    };
  }

  async findByIdAndUserId(
    kitId: string | ObjectId,
    userId: string | ObjectId
  ): Promise<KitDoc | null> {
    if (!ObjectId.isValid(kitId) || !ObjectId.isValid(userId)) {
      return null;
    }
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    return this.collection.findOne({ _id: kitObjId, userId: userObjId });
  }

  /**
   * Lightweight projection for status polling.
   * Avoids querying or serializing large questions, flashcards, schedule, and research bodies.
   */
  async findGenerationStatus(
    kitId: string | ObjectId,
    userId: string | ObjectId
  ): Promise<Pick<KitDoc, "_id" | "status" | "generation" | "updatedAt"> | null> {
    if (!ObjectId.isValid(kitId) || !ObjectId.isValid(userId)) {
      return null;
    }
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    return this.collection.findOne(
      { _id: kitObjId, userId: userObjId },
      {
        projection: {
          status: 1,
          generation: 1,
          updatedAt: 1,
        },
      }
    ) as Promise<Pick<KitDoc, "_id" | "status" | "generation" | "updatedAt"> | null>;
  }

  async findById(kitId: string | ObjectId): Promise<KitDoc | null> {
    if (!ObjectId.isValid(kitId)) {
      return null;
    }
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    return this.collection.findOne({ _id: kitObjId });
  }

  async findByUserId(userId: string | ObjectId): Promise<KitDoc[]> {
    if (!ObjectId.isValid(userId)) {
      return [];
    }
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    return this.collection
      .find({ userId: userObjId })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async findExistingCompleted(
    userId: string | ObjectId,
    inputHash: string
  ): Promise<KitDoc | null> {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    return this.collection.findOne({
      userId: userObjId,
      inputHash,
      status: "completed",
    });
  }

  async findActiveOrCompleted(
    userId: string | ObjectId,
    inputHash: string
  ): Promise<KitDoc | null> {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    return this.collection.findOne({
      userId: userObjId,
      inputHash,
      status: { $in: ["completed", "running", "queued"] },
    });
  }

  /**
   * Updates generation progress metadata.
   */
  async updateGenerationProgress(
    kitId: string | ObjectId,
    progressData: Partial<GenerationMetadata>
  ): Promise<boolean> {
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    for (const [key, value] of Object.entries(progressData)) {
      updateFields[`generation.${key}`] = value;
    }

    if (progressData.status) {
      updateFields["status"] = progressData.status;
    }

    const result = await this.collection.updateOne(
      { _id: kitObjId },
      { $set: updateFields }
    );
    return result.matchedCount > 0;
  }

  /**
   * Atomically saves completed kit and completes generation.
   */
  async saveCompletedKit(
    kitId: string | ObjectId,
    kit: Kit
  ): Promise<KitDoc | null> {
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      { _id: kitObjId },
      {
        $set: {
          kit,
          status: "completed",
          "generation.status": "completed",
          "generation.stage": "completed",
          "generation.progress": 100,
          "generation.message": "Kit generated successfully",
          "generation.completedAt": now,
          updatedAt: now,
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" }
    );

    return result || null;
  }

  /**
   * Optimistic update using version locking.
   * Throws if version mismatch (409 KIT_VERSION_CONFLICT).
   */
  async updateWithVersionLock(
    kitId: string | ObjectId,
    userId: string | ObjectId,
    expectedVersion: number,
    updatedKit: Kit
  ): Promise<KitDoc | null> {
    if (!ObjectId.isValid(kitId) || !ObjectId.isValid(userId)) {
      return null;
    }
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      {
        _id: kitObjId,
        userId: userObjId,
        version: expectedVersion,
      },
      {
        $set: {
          kit: updatedKit,
          updatedAt: now,
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" }
    );

    return result || null;
  }

  async delete(
    kitId: string | ObjectId,
    userId: string | ObjectId
  ): Promise<boolean> {
    if (!ObjectId.isValid(kitId) || !ObjectId.isValid(userId)) {
      return false;
    }
    const kitObjId = typeof kitId === "string" ? new ObjectId(kitId) : kitId;
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const result = await this.collection.deleteOne({
      _id: kitObjId,
      userId: userObjId,
    });
    return result.deletedCount > 0;
  }
}

export const kitRepository = new KitRepository();
