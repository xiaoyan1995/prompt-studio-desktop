import { useEffect, useState } from "react";

interface PromoInfo {
  discount_pct: number;
  label: string | null;
  label_en: string | null;
  expires_at: string | null;
}

interface ModelPricing {
  output_type: string;
  base_xins: number;
  multipliers: Record<string, any>;
  promo: PromoInfo | null;
}

type PricingMap = Record<string, ModelPricing>;

let _cache: PricingMap | null = null;
let _fetching = false;
let _listeners: Array<(data: PricingMap) => void> = [];

function fetchPricing() {
  if (_fetching) return;
  _fetching = true;
  fetch("/api/pricing/active")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.models) {
        _cache = data.models;
        _listeners.forEach((fn) => fn(_cache!));
      }
    })
    .catch(() => {})
    .finally(() => { _fetching = false; });
}

/**
 * Returns the active discount percentage for a model (0 if none).
 * Fetches /api/pricing/active once and caches globally.
 */
export function usePricingPromo(modelId: string): { discountPct: number; promoLabel: string | null } {
  const [map, setMap] = useState<PricingMap | null>(_cache);

  useEffect(() => {
    if (_cache) {
      setMap(_cache);
      return;
    }
    const listener = (data: PricingMap) => setMap(data);
    _listeners.push(listener);
    fetchPricing();
    return () => { _listeners = _listeners.filter((l) => l !== listener); };
  }, []);

  const entry = map?.[modelId];
  if (!entry?.promo) return { discountPct: 0, promoLabel: null };
  return {
    discountPct: entry.promo.discount_pct ?? 0,
    promoLabel: entry.promo.label ?? null,
  };
}

/**
 * Returns dynamic pricing maps from DB for a given model.
 * qualityPrices = multipliers.quality (size → xins)
 * qualityI2iPrices = multipliers.quality_i2i (size → xins)
 * outputQualityPrices = multipliers.output_quality (size → { low, medium, high })
 * Falls back to null if API hasn't loaded yet.
 */
export function useDynamicPricing(modelId: string): {
  qualityPrices: Record<string, number> | null;
  qualityI2iPrices: Record<string, number> | null;
  outputQualityPrices: Record<string, Record<string, number>> | null;
  loaded: boolean;
} {
  const [map, setMap] = useState<PricingMap | null>(_cache);

  useEffect(() => {
    if (_cache) {
      setMap(_cache);
      return;
    }
    const listener = (data: PricingMap) => setMap(data);
    _listeners.push(listener);
    fetchPricing();
    return () => { _listeners = _listeners.filter((l) => l !== listener); };
  }, []);

  const entry = map?.[modelId];
  if (!entry) return { qualityPrices: null, qualityI2iPrices: null, outputQualityPrices: null, loaded: map != null };

  const mult = entry.multipliers ?? {};
  return {
    qualityPrices: mult.quality ?? null,
    qualityI2iPrices: mult.quality_i2i ?? null,
    outputQualityPrices: mult.output_quality ?? null,
    loaded: true,
  };
}

/**
 * Returns all pricing maps at once (for components that need to switch between models).
 */
export function useAllPricing(): {
  getQualityPrices: (modelId: string) => Record<string, number> | null;
  getI2iPrices: (modelId: string) => Record<string, number> | null;
  getOutputQualityPrices: (modelId: string) => Record<string, Record<string, number>> | null;
  loaded: boolean;
} {
  const [map, setMap] = useState<PricingMap | null>(_cache);

  useEffect(() => {
    if (_cache) {
      setMap(_cache);
      return;
    }
    const listener = (data: PricingMap) => setMap(data);
    _listeners.push(listener);
    fetchPricing();
    return () => { _listeners = _listeners.filter((l) => l !== listener); };
  }, []);

  return {
    getQualityPrices: (id: string) => (map?.[id]?.multipliers?.quality ?? null),
    getI2iPrices: (id: string) => (map?.[id]?.multipliers?.quality_i2i ?? null),
    getOutputQualityPrices: (id: string) => (map?.[id]?.multipliers?.output_quality ?? null),
    loaded: map != null,
  };
}

export function applyDiscount(price: number, discountPct: number): number {
  if (discountPct <= 0) return price;
  return Math.max(0, Math.round(price * (1 - discountPct / 100)));
}
