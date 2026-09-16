import { ObjectId } from "mongodb";
import { getDatabase } from "./db.js";

export interface UserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserRepository {
  private get collection() {
    return getDatabase().collection<UserDoc>("users");
  }

  async create(email: string, passwordHash: string): Promise<UserDoc> {
    const now = new Date();
    const doc: Omit<UserDoc, "_id"> = {
      email: email.toLowerCase().trim(),
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(doc as UserDoc);
    return {
      _id: result.insertedId,
      ...doc,
    };
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    return this.collection.findOne({ email: email.toLowerCase().trim() });
  }

  async findById(id: string | ObjectId): Promise<UserDoc | null> {
    const objId = typeof id === "string" ? new ObjectId(id) : id;
    return this.collection.findOne({ _id: objId });
  }
}

export const userRepository = new UserRepository();
