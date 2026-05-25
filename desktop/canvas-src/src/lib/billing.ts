import { db } from "./db";
import { logger } from "./logger";

export async function debitBalance(
  userId: string,
  amount: number,
  jobId: string,
  description: string
): Promise<void> {
  const idempotencyKey = `debit:job:${jobId}`;

  await db.$transaction(async (tx) => {
    const balance = await (tx as any).creditBalance.findUnique({
      where: { user_id: userId },
    });

    if (!balance || balance.balance < amount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    await (tx as any).creditBalance.update({
      where: { user_id: userId },
      data: {
        balance: { decrement: amount },
        total_debited: { increment: amount },
      },
    });

    await (tx as any).creditLedger.create({
      data: {
        user_id: userId,
        type: "DEBIT_GENERATION",
        amount: -amount,
        balance_after: balance.balance - amount,
        job_id: jobId,
        description,
        idempotency_key: idempotencyKey,
      },
    });
  });

  logger.info({ userId, amount, jobId, idempotencyKey }, "Debit successful");
}

export async function refundBalance(
  userId: string,
  amount: number,
  jobId: string,
  type: "REFUND_GENERATION" | "REFUND_GENERATION_PARTIAL",
  description: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const prefix = type === "REFUND_GENERATION_PARTIAL" ? "partial_refund" : "refund";
  const idempotencyKey = `${prefix}:job:${jobId}`;

  await db.$transaction(async (tx) => {
    const balance = await (tx as any).creditBalance.findUnique({
      where: { user_id: userId },
    });

    if (!balance) {
      throw new Error("BALANCE_NOT_FOUND");
    }

    await (tx as any).creditBalance.update({
      where: { user_id: userId },
      data: {
        balance: { increment: amount },
        total_credited: { increment: amount },
      },
    });

    await (tx as any).creditLedger.create({
      data: {
        user_id: userId,
        type,
        amount,
        balance_after: balance.balance + amount,
        job_id: jobId,
        description,
        idempotency_key: idempotencyKey,
        metadata: metadata ?? undefined,
      },
    });
  });

  logger.info({ userId, amount, jobId, type, idempotencyKey }, "Refund successful");
}

/**
 * Look up active promo discount percentage for a model.
 * Returns 0 if no active promo.
 */
export async function getActiveDiscountPct(modelId: string): Promise<number> {
  try {
    const rule = await db.pricingRule.findFirst({
      where: { model_id: modelId, is_active: true },
      select: { promo_multipliers: true, promo_starts_at: true, promo_expires_at: true },
    });
    if (!rule) return 0;
    const pm = rule.promo_multipliers as Record<string, any> | null;
    const pct = pm?.discount_pct ?? 0;
    if (pct <= 0) return 0;
    const now = new Date();
    if (rule.promo_starts_at && rule.promo_starts_at > now) return 0;
    if (rule.promo_expires_at && rule.promo_expires_at <= now) return 0;
    return pct;
  } catch {
    return 0;
  }
}

export function applyDiscount(price: number, discountPct: number): number {
  if (discountPct <= 0) return price;
  return Math.max(0, Math.round(price * (1 - discountPct / 100)));
}

/** Storyboard LLM pricing (flat per-call) — fallback only, prefer DB */
const STORYBOARD_LLM_PRICE_FALLBACK: Record<string, number> = {
  "gemini-3.1-pro-preview-thinking-high": 10,
  "gpt-5.5": 10,
  "gemini-2.5-flash-preview-05-20": 4,
};

export async function getStoryboardPrice(modelId: string): Promise<number> {
  const pricing = await getModelPricing(modelId);
  if (pricing) {
    const mult = pricing.multipliers as Record<string, any>;
    if (mult.flat != null) return mult.flat;
  }
  return STORYBOARD_LLM_PRICE_FALLBACK[modelId] ?? 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic pricing from DB — single source of truth for all billing
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelPricingData {
  base_xins: number;
  output_type: string;
  multipliers: Record<string, any>;
}

/**
 * Read active pricing rule from DB for a model.
 * Returns null if no active rule found.
 */
export async function getModelPricing(modelId: string): Promise<ModelPricingData | null> {
  try {
    const rule = await db.pricingRule.findFirst({
      where: { model_id: modelId, is_active: true },
      select: { base_xins: true, output_type: true, multipliers: true },
    });
    if (!rule) return null;
    return {
      base_xins: rule.base_xins,
      output_type: rule.output_type,
      multipliers: rule.multipliers as Record<string, any>,
    };
  } catch (err) {
    logger.error({ err, modelId }, "Failed to read pricing from DB");
    return null;
  }
}

/**
 * Calculate image generation price from DB pricing rule.
 * Falls back to base_xins if multipliers are missing.
 */
export async function calculateImagePrice(
  modelId: string,
  imageSize: string,
  opts?: { hasRefs?: boolean; outputQuality?: string; count?: number }
): Promise<{ unitPrice: number; totalPrice: number; quality: string }> {
  const count = opts?.count ?? 1;
  const pricing = await getModelPricing(modelId);
  if (!pricing) {
    // No DB rule found — should not happen in prod
    logger.warn({ modelId }, "No pricing rule found in DB, using 0");
    return { unitPrice: 0, totalPrice: 0, quality: imageSize };
  }

  const mult = pricing.multipliers;
  const qualityMap: Record<string, number> = mult.quality ?? {};
  const qualityI2iMap: Record<string, number> = mult.quality_i2i ?? {};
  const outputQualityMap: Record<string, Record<string, number>> = mult.output_quality ?? {};

  // Determine effective quality (size tier)
  const availableSizes = Object.keys(qualityMap);
  const quality = qualityMap[imageSize] != null ? imageSize : (availableSizes[0] ?? imageSize);

  // Price resolution: output_quality > i2i > base quality
  let unitPrice: number;
  if (outputQualityMap[quality] && opts?.outputQuality) {
    unitPrice = outputQualityMap[quality][opts.outputQuality] ?? outputQualityMap[quality]["high"] ?? qualityMap[quality] ?? pricing.base_xins;
  } else if (opts?.hasRefs && qualityI2iMap[quality] != null) {
    unitPrice = qualityI2iMap[quality];
  } else {
    unitPrice = qualityMap[quality] ?? pricing.base_xins;
  }

  // Apply promo discount
  const discountPct = await getActiveDiscountPct(modelId);
  const discountedUnit = applyDiscount(unitPrice, discountPct);
  const totalPrice = discountedUnit * count;

  return { unitPrice: discountedUnit, totalPrice, quality };
}

export async function debitStoryboard(
  userId: string,
  amount: number,
  description: string,
): Promise<void> {
  const txnId = crypto.randomUUID();
  const idempotencyKey = `debit:storyboard:${userId}:${txnId}`;

  await db.$transaction(async (tx) => {
    const balance = await (tx as any).creditBalance.findUnique({
      where: { user_id: userId },
    });

    if (!balance || balance.balance < amount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    await (tx as any).creditBalance.update({
      where: { user_id: userId },
      data: {
        balance: { decrement: amount },
        total_debited: { increment: amount },
      },
    });

    await (tx as any).creditLedger.create({
      data: {
        user_id: userId,
        type: "DEBIT_GENERATION",
        amount: -amount,
        balance_after: balance.balance - amount,
        description,
        idempotency_key: idempotencyKey,
      },
    });
  });

  logger.info({ userId, amount, idempotencyKey }, "Storyboard debit successful");
}

/** Referral reward: 100 Xins per successful referral, max 10 */
export const REFERRAL_REWARD_XINS = 100;
export const REFERRAL_MAX_COUNT = 10;

export async function creditReferralReward(
  referrerId: string,
  newUserId: string,
): Promise<boolean> {
  const idempotencyKey = `gift:referral:${referrerId}:${newUserId}`;

  try {
    const referralCount = await db.user.count({
      where: { referred_by: referrerId },
    });

    if (referralCount > REFERRAL_MAX_COUNT) {
      logger.info({ referrerId, newUserId, referralCount }, "Referral reward skipped: max reached");
      return false;
    }

    await db.$transaction(async (tx) => {
      const balance = await (tx as any).creditBalance.findUnique({
        where: { user_id: referrerId },
      });

      if (!balance) {
        throw new Error("BALANCE_NOT_FOUND");
      }

      const newBalance = balance.balance + REFERRAL_REWARD_XINS;

      await (tx as any).creditBalance.update({
        where: { user_id: referrerId },
        data: {
          balance: { increment: REFERRAL_REWARD_XINS },
          total_credited: { increment: REFERRAL_REWARD_XINS },
        },
      });

      await (tx as any).creditLedger.create({
        data: {
          user_id: referrerId,
          type: "CREDIT_REFERRAL",
          amount: REFERRAL_REWARD_XINS,
          balance_after: newBalance,
          description: `Referral reward (invited user ${newUserId.slice(0, 8)})`,
          idempotency_key: idempotencyKey,
          metadata: { referred_user_id: newUserId },
        },
      });
    });

    logger.info({ referrerId, newUserId, reward: REFERRAL_REWARD_XINS }, "Referral reward credited");
    return true;
  } catch (err: any) {
    if (err?.code === "P2002") {
      logger.warn({ referrerId, newUserId }, "Referral reward already credited (idempotent)");
      return false;
    }
    logger.error({ err, referrerId, newUserId }, "Failed to credit referral reward");
    return false;
  }
}

export async function creditAdjustment(
  userId: string,
  amount: number,
  adjustmentId: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  const idempotencyKey = `adjustment:${adjustmentId}`;
  let ledgerId = "";

  await db.$transaction(async (tx) => {
    const balance = await (tx as any).creditBalance.findUnique({
      where: { user_id: userId },
    });

    if (!balance) {
      throw new Error("BALANCE_NOT_FOUND");
    }

    const newBalance = balance.balance + amount;

    await (tx as any).creditBalance.update({
      where: { user_id: userId },
      data: {
        balance: { increment: amount },
        total_credited: amount > 0 ? { increment: amount } : undefined,
        total_debited: amount < 0 ? { increment: Math.abs(amount) } : undefined,
      },
    });

    const ledger = await (tx as any).creditLedger.create({
      data: {
        user_id: userId,
        type: "CREDIT_ADJUSTMENT",
        amount,
        balance_after: newBalance,
        description,
        idempotency_key: idempotencyKey,
        metadata: metadata ?? undefined,
      },
    });

    ledgerId = ledger.id;
  });

  logger.info({ userId, amount, adjustmentId, idempotencyKey }, "Adjustment credited");
  return ledgerId;
}
