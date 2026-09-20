import { MongoClient, Db } from "mongodb";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (db && client) {
    return db;
  }

  try {
    logger.info("Connecting to MongoDB...");
    client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db();
    logger.info("MongoDB connected successfully");

    // Initialize indexes
    await ensureIndexes(db);

    return db;
  } catch (error) {
    logger.error({ error }, "Failed to connect to MongoDB");
    throw error;
  }
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error("Database not connected. Call connectToDatabase() first.");
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info("MongoDB connection closed");
  }
}

async function ensureIndexes(database: Db): Promise<void> {
  try {
    // Users collection
    const users = database.collection("users");
    await users.createIndex({ email: 1 }, { unique: true });

    // Sessions collection
    const sessions = database.collection("sessions");
    await sessions.createIndex({ tokenHash: 1 }, { unique: true });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

    // Kits collection
    const kits = database.collection("kits");
    await kits.createIndex({ userId: 1, updatedAt: -1 });
    await kits.createIndex({ userId: 1, inputHash: 1 });
    await kits.createIndex({ userId: 1, inputHash: 1, status: 1 });

    // Practice attempts collection
    const attempts = database.collection("practice_attempts");
    await attempts.createIndex({ kitId: 1, flashcardId: 1 });
    await attempts.createIndex({ userId: 1, kitId: 1 });

    logger.info("MongoDB indexes verified");
  } catch (error) {
    logger.warn({ error }, "Index creation warning (may already exist)");
  }
}
