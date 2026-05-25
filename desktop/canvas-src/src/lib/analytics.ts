type EventName =
  | "home_create_click"
  | "home_template_click"
  | "home_recent_project_open"
  | "home_recommendation_click"
  | "home_open_assets"
  | "dashboard_create_click"
  | "dashboard_search"
  | "canvas_zoom_tier_hit"
  | "canvas_maximize_media_load"
  | "canvas_original_download"
  | "canvas_batch_download";

type EventPayload = Record<string, string | number | boolean | null>;

export function trackEvent(name: EventName, payload?: EventPayload) {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV === "development") {
    console.debug(`[analytics] ${name}`, payload ?? {});
  }

  // Future: integrate with PostHog, Mixpanel, GA4, etc.
  // window.posthog?.capture(name, payload);
}
