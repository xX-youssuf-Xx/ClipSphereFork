/**
 * Worker process entrypoint — runs independently from the API server.
 * Started via: node dist/worker.js (or "bun run worker" in dev)
 * 
 * Connects to MongoDB and Redis, then starts all BullMQ workers.
 * This process handles CPU/IO-heavy background tasks without blocking the API.
 */
import { connectDatabase } from "./config/database";
import { startEmbeddingWorker } from "./workers/embeddingWorker";

async function startWorker() {
  console.log("[worker] Starting background worker process...");

  await connectDatabase();

  startEmbeddingWorker();

  console.log("[worker] All workers running. Waiting for jobs...");
}

startWorker().catch((err) => {
  console.error("[worker] Failed to start worker process:", err);
  process.exit(1);
});
