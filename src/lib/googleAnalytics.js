export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-C2VJYSWL4H";

const LIVE_HOSTNAMES = new Set(["hoomanfinder.com", "www.hoomanfinder.com"]);
const INITIALIZED_KEY = "__hoomanFinderGoogleAnalyticsInitialized";

export function initializeGoogleAnalytics({
  windowRef = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
  now = new Date(),
} = {}) {
  if (!windowRef || !documentRef || !LIVE_HOSTNAMES.has(windowRef.location?.hostname)) {
    return false;
  }

  if (windowRef[INITIALIZED_KEY]) return false;
  windowRef[INITIALIZED_KEY] = true;

  windowRef.dataLayer = windowRef.dataLayer || [];
  windowRef.gtag =
    windowRef.gtag ||
    function gtag() {
      windowRef.dataLayer.push(arguments);
    };

  windowRef.gtag("js", now);
  windowRef.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID);

  const script = documentRef.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`;
  script.dataset.googleAnalyticsId = GOOGLE_ANALYTICS_MEASUREMENT_ID;
  documentRef.head.appendChild(script);

  return true;
}
