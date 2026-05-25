import type { MemberTier } from "@/generated/prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { getTierBenefits } from "./subscription";

// ─── Concurrency Check ─────────────────────────────────

export async function checkConcurrency(userId: string, tier: MemberTier): Promise<void> {
  const benefits = getTierBenefits(tier);

  const runningCount = await db.job.count({
    where: {
      user_id: userId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });

  if (runningCount >= benefits.maxConcurrency) {
    throw new AppError(
      "TIER_001",
      `并发任务已满。${benefits.label} 用户最多同时运行 ${benefits.maxConcurrency} 个任务，当前 ${runningCount} 个`,
      429
    );
  }
}

// ─── Resolution Check ──────────────────────────────────

export function checkResolution(resolution: string, tier: MemberTier): void {
  const benefits = getTierBenefits(tier);
  const [maxW, maxH] = benefits.maxResolution.split("x").map(Number);
  const [reqW, reqH] = resolution.split("x").map(Number);

  if (isNaN(reqW) || isNaN(reqH)) return; // non-standard format, skip

  if (reqW > maxW || reqH > maxH) {
    throw new AppError(
      "TIER_002",
      `分辨率 ${resolution} 超过 ${benefits.label} 用户限制 (最大 ${benefits.maxResolution})。升级到 Pro 解锁更高分辨率`,
      403
    );
  }
}

// ─── Queue Priority ────────────────────────────────────

export function getQueuePriority(tier: MemberTier): number {
  const benefits = getTierBenefits(tier);
  // BullMQ: lower number = higher priority
  // Map our priority (higher=better) to BullMQ (lower=better)
  return Math.max(1, 11 - benefits.queuePriority);
}

// ─── Get User Tier ─────────────────────────────────────

export async function getUserTier(userId: string): Promise<MemberTier> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });
  return user?.tier ?? "FREE";
}
