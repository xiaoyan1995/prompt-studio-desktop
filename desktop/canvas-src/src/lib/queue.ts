import { Queue } from "bullmq";

const connection = {
  host: new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname,
  port: Number(new URL(process.env.REDIS_URL ?? "redis://localhost:6379").port) || 6379,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

type AnyQueue = Queue;
type QueueFactory = () => AnyQueue;

function createLazyQueue(factory: QueueFactory): AnyQueue {
  let instance: AnyQueue | undefined;
  const ensure = () => {
    if (!instance) instance = factory();
    return instance;
  };

  return new Proxy({} as AnyQueue, {
    get(_target, prop, _receiver) {
      const queue = ensure();
      const value = Reflect.get(queue as object, prop as PropertyKey);
      if (typeof value === "function") {
        return value.bind(queue);
      }
      return value;
    },
  });
}

export const imageQueue = createLazyQueue(() => new Queue("generation.image", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));

export const videoQueue = createLazyQueue(() => new Queue("generation.video", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));

export const audioQueue = createLazyQueue(() => new Queue("generation.audio", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));

/** 分镜解析（文本 / 后续图片、视频）— 与生成队列隔离 */
export const storyboardParseQueue = createLazyQueue(() => new Queue("storyboard.parse", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));

/** 分镜提示词生成 — 后台逐 segment 生成，不受 HTTP 连接限制 */
export const storyboardPromptsQueue = createLazyQueue(() => new Queue("storyboard.prompts", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));

/** 资产提取 — 后台 LLM 解析剧本提取角色/场景/道具 */
export const storyboardExtractAssetsQueue = createLazyQueue(() => new Queue("storyboard.extract-assets", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));

/** 分镜生成 — 后台 LLM 流式生成分镜表（含剧本分析预处理） */
export const storyboardGenerateQueue = createLazyQueue(() => new Queue("storyboard.generate", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
}));
