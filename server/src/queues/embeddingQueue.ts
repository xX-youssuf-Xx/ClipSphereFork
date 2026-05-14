import { Queue } from "bullmq";
import redisConnection from "../config/redis";

/**
 * Job data shapes for each queue.
 */
export type EmbeddingJobData =
  | { type: "video"; videoId: string }
  | { type: "user"; userId: string };

/**
 * Central BullMQ queue for all embedding generation jobs.
 * Producers (e.g. videoService, userService) add jobs here.
 * The worker process consumes and processes them.
 */
export const embeddingQueue = new Queue<EmbeddingJobData>("embeddings", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 30_000, // 30s base → 30s, 60s, 120s, 240s, 480s
    },
    removeOnComplete: { count: 100 },  // keep last 100 completed jobs for inspection
    removeOnFail: { count: 200 },      // keep last 200 failed jobs for debugging
  },
});
