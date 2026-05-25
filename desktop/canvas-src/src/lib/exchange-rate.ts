import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY ?? "";
const EXCHANGE_RATE_API_URL = `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/USD`;
const CACHE_KEY = "exchange_rates:usd";
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MARKUP = 1.03; // 3% markup to cover Stripe fees + exchange rate fluctuation

// Fallback rates if API is unavailable
const FALLBACK_RATES: Record<string, number> = {
  CNY: 7.3,
  MYR: 4.5,
};

export interface ExchangeRates {
  CNY: number;
  MYR: number;
  updated_at: string;
}

/** Fetch live rates from ExchangeRate-API, cache in Redis for 24h, apply 3% markup */
export async function getExchangeRates(): Promise<ExchangeRates> {
  try {
    // Try Redis cache first
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ExchangeRates;
    }
  } catch {
    // Redis unavailable, continue to API
  }

  // Fetch from API
  if (!EXCHANGE_RATE_API_KEY) {
    logger.warn("EXCHANGE_RATE_API_KEY not set, using fallback rates");
    return buildRatesFromRaw(FALLBACK_RATES);
  }

  try {
    const res = await fetch(EXCHANGE_RATE_API_URL, { next: { revalidate: CACHE_TTL_SECONDS } });
    if (!res.ok) {
      logger.error({ status: res.status }, "ExchangeRate API error");
      return buildRatesFromRaw(FALLBACK_RATES);
    }

    const data = await res.json();
    if (data.result !== "success") {
      logger.error({ result: data.result }, "ExchangeRate API failed");
      return buildRatesFromRaw(FALLBACK_RATES);
    }

    const rawRates = data.conversion_rates as Record<string, number>;
    const rates = buildRatesFromRaw({
      CNY: rawRates.CNY ?? FALLBACK_RATES.CNY,
      MYR: rawRates.MYR ?? FALLBACK_RATES.MYR,
    });

    // Cache in Redis
    try {
      await redis.set(CACHE_KEY, JSON.stringify(rates), "EX", CACHE_TTL_SECONDS);
    } catch {
      // Non-critical
    }

    logger.info({ rates }, "Exchange rates refreshed");
    return rates;
  } catch (err) {
    logger.error({ err }, "ExchangeRate API fetch failed");
    return buildRatesFromRaw(FALLBACK_RATES);
  }
}

function buildRatesFromRaw(raw: Record<string, number>): ExchangeRates {
  return {
    CNY: Math.ceil(raw.CNY * MARKUP * 100) / 100, // round up to 2 decimals
    MYR: Math.ceil(raw.MYR * MARKUP * 100) / 100,
    updated_at: new Date().toISOString(),
  };
}

/** Convert USD cents to target currency smallest unit, using live rate with markup */
export function convertWithRate(usdCents: number, rate: number): number {
  return Math.ceil(usdCents * rate);
}
