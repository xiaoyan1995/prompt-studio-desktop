import type { MemberTier } from "@/generated/prisma/client";

// ─── Tier Benefits ──────────────────────────────────────

export interface TierBenefits {
  tier: MemberTier;
  label: string;
  monthlyXins: number;
  maxConcurrency: number;
  maxResolution: string;
  queuePriority: number;     // higher = higher priority in BullMQ
  priceUsdCents: number;     // 0 for FREE
  stripePriceId: string | null;
}

export const TIER_CONFIG: Record<MemberTier, TierBenefits> = {
  FREE: {
    tier: "FREE",
    label: "Free",
    monthlyXins: 0,
    maxConcurrency: 1,
    maxResolution: "1024x1024",
    queuePriority: 1,
    priceUsdCents: 0,
    stripePriceId: null,
  },
  BASIC: {
    tier: "BASIC",
    label: "Basic",
    monthlyXins: 1500,
    maxConcurrency: 1,
    maxResolution: "2048x2048",
    queuePriority: 3,
    priceUsdCents: 750,
    stripePriceId: process.env.STRIPE_PRICE_BASIC ?? null,
  },
  PRO: {
    tier: "PRO",
    label: "Pro",
    monthlyXins: 6000,
    maxConcurrency: 3,
    maxResolution: "4096x4096",
    queuePriority: 5,
    priceUsdCents: 3000,
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
  },
  ULTIMATE: {
    tier: "ULTIMATE",
    label: "Ultimate",
    monthlyXins: 36000,
    maxConcurrency: 5,
    maxResolution: "4096x4096",
    queuePriority: 8,
    priceUsdCents: 18000,
    stripePriceId: process.env.STRIPE_PRICE_ULTIMATE ?? null,
  },
  MAX: {
    tier: "MAX",
    label: "Max",
    monthlyXins: 90000,
    maxConcurrency: 5,
    maxResolution: "4096x4096",
    queuePriority: 10,
    priceUsdCents: 36000,
    stripePriceId: process.env.STRIPE_PRICE_MAX ?? null,
  },
};

// ─── Credit Packs (one-time purchase) ───────────────────

export interface CreditPack {
  id: string;
  xins: number;
  priceUsdCents: number;
  label: string;
  popular?: boolean;
  bonus?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-500",    xins: 500,    priceUsdCents: 500,    label: "500 新点" },
  { id: "pack-5000",   xins: 5000,   priceUsdCents: 5000,   label: "5,000 新点", popular: true },
  { id: "pack-52500",  xins: 52500,  priceUsdCents: 50000,  label: "52,500 新点", bonus: "+5%" },
  { id: "pack-137500", xins: 137500, priceUsdCents: 125000, label: "137,500 新点", bonus: "+10%" },
];

export function getCreditPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === packId);
}

export function getTierBenefits(tier: MemberTier): TierBenefits {
  return TIER_CONFIG[tier];
}

// ─── Multi-Currency Support ──────────────────────────────

export type SupportedCurrency = "usd" | "cny" | "myr";

export interface CurrencyConfig {
  code: SupportedCurrency;
  symbol: string;
  label: string;
  rate: number; // multiplier vs USD (1 USD = rate units)
  stripePaymentMethods: string[];
}

export const CURRENCIES: Record<SupportedCurrency, CurrencyConfig> = {
  usd: {
    code: "usd",
    symbol: "$",
    label: "USD",
    rate: 1,
    stripePaymentMethods: ["card", "link"],
  },
  cny: {
    code: "cny",
    symbol: "¥",
    label: "CNY",
    rate: 7.3,
    stripePaymentMethods: ["card", "alipay", "link"],
  },
  myr: {
    code: "myr",
    symbol: "RM",
    label: "MYR",
    rate: 4.5,
    stripePaymentMethods: ["card", "alipay", "link"],
  },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES) as SupportedCurrency[];

/** Convert USD cents to target currency smallest unit (cents/fen/sen) */
export function convertToLocalCurrency(usdCents: number, currency: SupportedCurrency): number {
  const config = CURRENCIES[currency];
  return Math.ceil(usdCents * config.rate);
}

/** Format price for display */
export function formatPrice(amountSmallest: number, currency: SupportedCurrency): string {
  const config = CURRENCIES[currency];
  const major = amountSmallest / 100;
  return `${config.symbol}${major.toFixed(major % 1 === 0 ? 0 : 2)}`;
}
