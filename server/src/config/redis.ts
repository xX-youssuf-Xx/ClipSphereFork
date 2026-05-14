import { ConnectionOptions } from "bullmq";

/**
 * Shared BullMQ Redis connection config.
 * Uses the dedicated Redis container defined in docker-compose.yml.
 * Falls back to localhost for local development.
 */
const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST || "cache",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export default redisConnection;
