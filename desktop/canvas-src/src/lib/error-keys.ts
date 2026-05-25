/**
 * Map a raw error message string to a canonical i18n error key.
 * Used by both MediaActiveView (SSE catch) and page-level recovery.
 *
 * OpenCrow errors arrive as "[ErrorType] message" (see parseOpenCrowError).
 * We match on both the structured type prefix and free-text keywords.
 */
export function toErrorKey(raw: string): string {
  const lower = raw.toLowerCase();

  // ── OpenCrow structured error types (matched via [Type] prefix) ──

  // Sensitive content detection (input image/text/video/audio)
  if (lower.includes("inputimagesensitivecontentdetected") ||
      lower.includes("inputtextsensitivecontentdetected") ||
      lower.includes("inputvideosensitivecontentdetected") ||
      lower.includes("inputaudiosensitivecontentdetected")) {
    if (lower.includes("privacyinformation")) return "errFaceDetected";
    if (lower.includes("sexualcontent")) return "errNSFW";
    if (lower.includes("violence")) return "errContentSafety";
    if (lower.includes("politicalcontent")) return "errContentSecurity";
    return "errSensitiveContent";
  }

  // Data inspection failures
  if (lower.includes("datainspectionfailed")) return "errContentSafety";

  // Parameter validation errors
  if (lower.includes("invalidparameter.prompttoolong")) return "errPromptTooLong";
  if (lower.includes("invalidparameter.imagesizetoolarge")) return "errImageTooLarge";
  if (lower.includes("invalidparameter.videosizetoolarge")) return "errVideoTooLarge";
  if (lower.includes("invalidparameter.videodurationtoolong")) return "errVideoDurationTooLong";
  if (lower.includes("invalidparameter.urlnotaccessible")) return "errUrlNotAccessible";
  if (lower.includes("invalidparameter.urlinvalid")) return "errUrlNotAccessible";
  if (lower.includes("invalidparameter.unsupportedimageformat") ||
      lower.includes("invalidparameter.unsupportedvideoformat") ||
      lower.includes("invalidparameter.unsupportedaudioformat")) return "errUnsupportedFormat";
  if (lower.includes("invalidparameter")) return "errBadParams";
  if (lower.includes("invalid_request_error")) return "errBadParams";

  // Auth / billing
  if (lower.includes("insufficient_balance")) return "errInsufficientBalance";
  if (lower.includes("unauthorized") || lower.includes("permission_denied")) return "errGenericFailed";

  // Rate limiting / concurrency
  if (lower.includes("rate_limit_exceeded") || lower.includes("ratelimitexceeded") ||
      lower.includes("throttling")) return "errRateLimit";
  if (lower.includes("concurrencyexceeded") || lower.includes("concurrency")) return "errConcurrency";

  // Server errors
  if (lower.includes("internalerror") || lower.includes("internalservererror") ||
      lower.includes("internal_error")) return "errServerError";
  if (lower.includes("service_unavailable") || lower.includes("serviceunavailable") ||
      lower.includes("badgateway")) return "errServiceUnavailable";
  if (lower.includes("requesttimeout") || lower.includes("modeltimeoutexception")) return "errTimeout";

  // Not found
  if (lower.includes("model_not_found")) return "errGenericFailed";
  if (lower.includes("resourcenotfound")) return "errGenericFailed";

  // ── Legacy free-text keyword matching ──

  if (lower.includes("real human face") || lower.includes("人脸") || lower.includes("face") && lower.includes("detect")) return "errFaceDetected";
  if (lower.includes("敏感信息") || lower.includes("sensitive information") || lower.includes("sensitive")) return "errSensitiveContent";
  if (lower.includes("could not generate an image") || lower.includes("could not generate a image")) return "errContentSafety";
  if (lower.includes("safety") || lower.includes("blocked") || lower.includes("content policy")) return "errContentSafety";
  if (lower.includes("nsfw")) return "errNSFW";
  if (lower.includes("unprocessable entity") || lower.includes("field required")) return "errBadParams";
  if (lower.includes("余额不足")) return "errInsufficientBalance";
  if (lower.includes("copyright")) return "errCopyright";
  if (lower.includes("content security") || lower.includes("security audit")) return "errContentSecurity";
  if (lower.includes("timeout") || lower.includes("timed out")) return "errTimeout";
  if (lower.includes("sse connection lost")) return "errConnectionLost";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "errRateLimit";
  
  if (raw && raw.trim()) {
    const isDescriptive = /[\u4e00-\u9fa5]/.test(raw) || raw.includes(" ") || raw.includes(":") || raw.includes("：") || raw.length > 30;
    if (isDescriptive) return raw.trim();
  }
  return "errGenericFailed";
}
