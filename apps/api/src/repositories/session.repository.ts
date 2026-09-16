import { ObjectId } from "mongodb";
import { getDatabase } from "./db.js";

export interface SessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

export class SessionRepository {
  private get collection() {
    return getDatabase().collection<SessionDoc>("sessions");
  }

  async create(
    userId: string | ObjectId,
    tokenHash: string,
    expiresAt: Date
  ): Promise<SessionDoc> {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const now = new Date();
    const doc: Omit<SessionDoc, "_id"> = {
      userId: userObjId,
      tokenHash,
      expiresAt,
      createdAt: now,
      lastUsedAt: now,
    };

    const result = await this.collection.insertOne(doc as SessionDoc);
    return {
      _id: result.insertedId,
      ...doc,
    };
  }

  async findByTokenHash(tokenHash: string): Promise<SessionDoc | null> {
    const session = await this.collection.findOne({ tokenHash });
    if (session) {
      // Refresh lastUsedAt asynchronously
      this.collection.updateOne(
        { _id: session._id },
        { $set: { lastUsedAt: new Date() } }
      ).catch(() => {});
    }
    return session;
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ tokenHash });
    return result.deletedCount > 0;
  }

  async deleteByUserId(userId: string | ObjectId): Promise<number> {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const result = await this.collection.deleteMany({ userId: userObjId });
    return result.deletedCount;
  }
}

export const sessionRepository = new SessionRepository();
