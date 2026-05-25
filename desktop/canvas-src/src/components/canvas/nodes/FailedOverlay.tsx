"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

/**
 * Centered red error overlay for nodes in "failed" state.
 * Shows a red-tinted backdrop with the error message centered.
 */

const ERR_KEYS = new Set([
  "failed",
  "errFaceDetected",
  "errSensitiveContent",
  "errContentSafety",
  "errContentSecurity",
  "errTimeout",
  "errConnectionLost",
  "errInsufficientBalance",
  "errConcurrency",
  "errRateLimit",
  "errGenericFailed",
  "errBadParams",
  "errCopyright",
  "errNSFW",
]);

function FailedOverlayComponent({ errorMessage }: { errorMessage?: string }) {
  const t = useTranslations("canvas");

  const displayMsg = errorMessage
    ? ERR_KEYS.has(errorMessage) ? t(errorMessage) : errorMessage
    : t("failed");

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center bg-black/60"
      style={{ borderRadius: 12, zIndex: 5 }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-2 px-4 max-w-[85%]">
        {/* Red dot */}
        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" style={{ boxShadow: "0 0 8px 2px rgba(239,68,68,0.4)" }} />
        {/* Error text */}
        <span className="text-xs text-red-400 text-center leading-relaxed">
          {displayMsg}
        </span>
      </div>
    </div>
  );
}

export const FailedOverlay = memo(FailedOverlayComponent);
