"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

export function useLocalePath() {
  const locale = useLocale();
  return useCallback((path: string) => `/${locale}${path}`, [locale]);
}
