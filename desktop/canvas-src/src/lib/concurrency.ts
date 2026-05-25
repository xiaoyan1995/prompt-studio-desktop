import { db } from "./db";
import type { MemberTier } from "@/generated/prisma/client";
import { getTierBenefits } from "./subscription";

const UNLIMITED_ROLES = new Set(["ADMIN", "OWNER"]);

export async function checkUserConcurrency(userId: string): Promise<{
  allowed: boolean;
  running: number;
  limit: number;
  tier: MemberTier;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true, role: true },
  });

  const tier: MemberTier = (user?.tier as MemberTier) ?? "FREE";

  if (user?.role && UNLIMITED_ROLES.has(user.role)) {
    return { allowed: true, running: 0, limit: Infinity, tier };
  }

  const limit = getTierBenefits(tier).maxConcurrency;

  const running = await db.job.count({
    where: {
      user_id: userId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });

  return {
    allowed: running < limit,
    running,
    limit,
    tier,
  };
}
