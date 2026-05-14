import { Worker, Job } from "bullmq";
import redisConnection from "../config/redis";
import { EmbeddingJobData } from "../queues/embeddingQueue";
import Video from "../models/Video";
import { generateVideoEmbedding, ACTIVE_VIDEO_EMBEDDING_MODEL } from "../services/embeddingService";
import AppError from "../utils/AppError";

function safeErrorString(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function computeNextRetryAt(retryCount: number): Date {
  const baseMs = 30_000;
  const maxMs = 15 * 60_000;
  const delayMs = Math.min(maxMs, baseMs * Math.pow(2, Math.min(retryCount, 5)));
  return new Date(Date.now() + delayMs);
}

/**
 * Processes a single video embedding job.
 * Fetches the video, generates the embedding via Gemini, and persists it.
 */
async function processVideoEmbedding(videoId: string): Promise<void> {
  const video = await Video.findById(videoId);
  if (!video) {
    console.warn(`[worker] Video ${videoId} not found — skipping`);
    return;
  }

  const embedding = await generateVideoEmbedding({
    title: video.title,
    description: video.description,
    tags: video.tags,
    duration: video.duration,
  });

  await Video.findByIdAndUpdate(videoId, {
    embedding,
    embeddingUpdatedAt: new Date(),
    embeddingModel: ACTIVE_VIDEO_EMBEDDING_MODEL,
    embeddingStatus: "ready",
    embeddingLastError: null,
    embeddingNextRetryAt: null,
  });

  console.log(`[worker] ✅ Embedding updated for video ${videoId}`);
}

/**
 * BullMQ worker — runs in the dedicated worker.js process.
 * Concurrency of 2: generates up to 2 embeddings simultaneously.
 */
export function startEmbeddingWorker() {
  const worker = new Worker<EmbeddingJobData>(
    "embeddings",
    async (job: Job<EmbeddingJobData>) => {
      const { data } = job;
      console.log(`[worker] Processing job ${job.id} — type: ${data.type}`);

      if (data.type === "video") {
        await processVideoEmbedding(data.videoId);
      } else if (data.type === "user") {
        // Placeholder: user embedding handled here when implemented
        console.log(`[worker] User embedding for ${data.userId} — not yet implemented`);
      } else {
        throw new AppError(`Unknown job type`, 400);
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const data = job.data;
    const errorText = safeErrorString(err).slice(0, 2000);
    console.error(`[worker] Job ${job.id} failed (attempt ${job.attemptsMade}):`, errorText);

    // Persist failure status to DB so the API can surface it
    if (data.type === "video") {
      const retryCount = job.attemptsMade;
      await Video.findByIdAndUpdate(data.videoId, {
        embeddingStatus: job.attemptsMade >= (job.opts.attempts ?? 5) ? "failed" : "pending",
        embeddingLastError: errorText,
        embeddingRetryCount: retryCount,
        embeddingNextRetryAt: computeNextRetryAt(retryCount),
        embeddingModel: ACTIVE_VIDEO_EMBEDDING_MODEL,
      }).catch(() => {});
    }
  });

  worker.on("error", (err) => {
    console.error("[worker] Worker error:", err);
  });

  console.log("[worker] 🚀 Embedding worker started (concurrency: 2)");
  return worker;
}
