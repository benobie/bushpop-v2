import { Redis } from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6380", {
      // null is required by BullMQ for blocking commands (BRPOPLPUSH).
      // Other consumers (Fastify, rate-limit) work fine with null.
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
