import { redis } from "./redis";
import { RateLimitError } from "./errors";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = { windowMs: 60_000, maxRequests: 30 }
): Promise<void> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const redisKey = `ratelimit:${key}`;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zadd(redisKey, now, `${now}`);
  pipeline.zcard(redisKey);
  pipeline.pexpire(redisKey, config.windowMs);

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number;

  if (count > config.maxRequests) {
    throw new RateLimitError(config.windowMs);
  }
}

export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000 * 15,
  maxRequests: 5,
};

export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};
