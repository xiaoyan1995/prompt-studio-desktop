import Redis from "ioredis";
import { EventEmitter } from "events";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient() {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    // Avoid network dial during module evaluation (e.g. next build).
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

function createNoopRedisClient(): Redis {
  const subscriber = new EventEmitter();
  const pipelineState = {
    zremrangebyscore: () => pipelineState,
    zadd: () => pipelineState,
    zcard: () => pipelineState,
    pexpire: () => pipelineState,
    exec: async () => [
      [null, 0],
      [null, 1],
      [null, 0],
      [null, 1],
    ] as Array<[null, number]>,
  };

  const noopRedis = {
    pipeline: () => pipelineState,
    ping: async () => "PONG",
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
    publish: async () => 0,
    duplicate: () => ({
      subscribe: async () => 1,
      unsubscribe: async () => 1,
      on: (...args: Parameters<typeof subscriber.on>) => {
        subscriber.on(...args);
        return subscriber;
      },
      disconnect: () => undefined,
      quit: async () => "OK",
    }),
    disconnect: () => undefined,
    quit: async () => "OK",
  };

  return noopRedis as unknown as Redis;
}

const disableRedisForBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_DISABLE_REDIS_DURING_BUILD === "1";

export const redis =
  globalForRedis.redis ??
  (disableRedisForBuild ? createNoopRedisClient() : createRedisClient());

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
