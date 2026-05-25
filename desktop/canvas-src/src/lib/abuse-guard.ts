import { redis } from "./redis";
import { AppError } from "./errors";
import { logger } from "./logger";

// ─── Sliding Window Job Rate Limiter ───────────────────
// Prevents users from creating too many jobs in a short time window

interface AbuseConfig {
  /** Max jobs allowed in the window */
  maxJobs: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key prefix */
  prefix: string;
}

const JOB_BURST_CONFIG: AbuseConfig = {
  maxJobs: 20,
  windowSeconds: 60,
  prefix: "abuse:job-burst",
};

const JOB_DAILY_CONFIG: AbuseConfig = {
  maxJobs: 200,
  windowSeconds: 86400,
  prefix: "abuse:job-daily",
};

const REGISTER_BURST_CONFIG: AbuseConfig = {
  maxJobs: 3,
  windowSeconds: 3600,
  prefix: "abuse:register-burst",
};

async function checkAbuseLimit(key: string, config: AbuseConfig): Promise<void> {
  const redisKey = `${config.prefix}:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zadd(redisKey, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
  pipeline.zcard(redisKey);
  pipeline.pexpire(redisKey, config.windowSeconds * 1000);

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number;

  if (count > config.maxJobs) {
    logger.warn(
      { key, count, max: config.maxJobs, window: config.windowSeconds, prefix: config.prefix },
      "Abuse limit exceeded"
    );
    throw new AppError(
      "ABUSE_001",
      `操作频率过高，请稍后再试 (${config.windowSeconds}s 内最多 ${config.maxJobs} 次)`,
      429
    );
  }
}

/**
 * Check if user is creating jobs too frequently (burst: 20/min, daily: 200/day)
 */
export async function checkJobAbuse(userId: string): Promise<void> {
  await checkAbuseLimit(userId, JOB_BURST_CONFIG);
  await checkAbuseLimit(userId, JOB_DAILY_CONFIG);
}

/**
 * Check if an IP is registering too many accounts (3/hour)
 */
export async function checkRegisterAbuse(ip: string): Promise<void> {
  await checkAbuseLimit(ip, REGISTER_BURST_CONFIG);
}
