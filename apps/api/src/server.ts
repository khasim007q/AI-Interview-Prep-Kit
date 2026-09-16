import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { connectToDatabase, closeDatabase } from "./repositories/db.js";

async function bootstrap() {
  try {
    // Attempt database connection
    await connectToDatabase();

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 API server ready on http://localhost:${env.PORT}`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        await closeDatabase();
        logger.info("Server closed.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error({ error }, "Failed to start API server");
    process.exit(1);
  }
}

if (env.NODE_ENV !== "test") {
  bootstrap();
}

export default app;
