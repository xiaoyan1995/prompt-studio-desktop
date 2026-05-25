import { db } from "./db";
import type { PricingBreakdown, JobInputParams } from "@/types/generation";

interface PricingRuleData {
  base_xins: number;
  multipliers: {
    resolution?: Record<string, number>;
    tier?: Record<string, number>;
    duration_s?: Record<string, number>;
    source_type?: Record<string, number>;
    /**
     * Optional shot-limit multiplier:
     * - "linear": multiplier = max_shots
     * - object map: use exact key match, e.g. { "20": 1.2, "40": 1.5 }
     */
    max_shots?: Record<string, number> | "linear";
    count?: "linear";
  };
}

export async function calculatePrice(
  modelId: string,
  params: JobInputParams
): Promise<PricingBreakdown> {
  const rule = await db.pricingRule.findFirst({
    where: { model_id: modelId },
    orderBy: { created_at: "desc" },
  });

  if (!rule) {
    throw new Error(`No pricing rule for model: ${modelId}`);
  }

  const data = rule as unknown as { base_xins: number; multipliers: PricingRuleData["multipliers"] };
  const base = data.base_xins;
  const m = data.multipliers;

  const resolutionKey = params.resolution ?? "1024x1024";
  const resolution_multiplier = m.resolution?.[resolutionKey] ?? 1.0;

  const tierKey = params.tier ?? "standard";
  const tier_multiplier = m.tier?.[tierKey] ?? 1.0;

  const durationKey = params.duration_s?.toString() ?? "";
  const duration_multiplier = durationKey ? (m.duration_s?.[durationKey] ?? 1.0) : 1.0;

  const sourceTypeKey = params.source_type ?? "";
  const source_type_multiplier = sourceTypeKey ? (m.source_type?.[sourceTypeKey] ?? 1.0) : 1.0;

  const shots = params.max_shots;
  const max_shots_multiplier =
    shots != null && shots > 0
      ? m.max_shots === "linear"
        ? shots
        : m.max_shots && typeof m.max_shots === "object"
          ? (m.max_shots[String(shots)] ?? 1.0)
          : 1.0
      : 1.0;

  const count = params.count ?? 1;
  const count_multiplier = m.count === "linear" ? count : 1;

  const raw =
    base *
    resolution_multiplier *
    tier_multiplier *
    duration_multiplier *
    source_type_multiplier *
    max_shots_multiplier *
    count_multiplier;
  const total_xins = Math.round(raw);

  if (count > 1 && total_xins % count !== 0) {
    throw new Error(
      `price_xins (${total_xins}) must be divisible by count (${count}). Adjust pricing rule.`
    );
  }

  const unit_price = count > 0 ? total_xins / count : total_xins;

  return {
    base_xins: base,
    resolution_multiplier,
    count_multiplier,
    tier_multiplier,
    duration_multiplier,
    source_type_multiplier,
    max_shots_multiplier,
    total_xins,
    unit_price,
  };
}
