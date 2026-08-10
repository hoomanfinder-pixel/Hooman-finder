export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-C2VJYSWL4H";

const LIVE_HOSTNAMES = new Set(["hoomanfinder.com", "www.hoomanfinder.com"]);
const INITIALIZED_KEY = "__hoomanFinderGoogleAnalyticsInitialized";
const TRACKED_ONCE_KEY = "__hoomanFinderGoogleAnalyticsTrackedOnce";
const EVENT_STORAGE_PREFIX = "hoomanFinder.googleAnalytics.event.v1";

export const GOOGLE_ANALYTICS_EVENTS = Object.freeze({
  QUIZ_START: "quiz_start",
  QUIZ_COMPLETE: "quiz_complete",
  ADOPTION_LINK_CLICK: "adoption_link_click",
});

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

function trackGoogleAnalyticsEvent(
  eventName,
  { windowRef = typeof window === "undefined" ? null : window } = {}
) {
  if (
    !windowRef ||
    !LIVE_HOSTNAMES.has(windowRef.location?.hostname) ||
    typeof windowRef.gtag !== "function"
  ) {
    return false;
  }

  // Conversion events intentionally contain no quiz, dog, shelter, or user data.
  windowRef.gtag("event", eventName);
  return true;
}

function trackGoogleAnalyticsEventOnce(eventName, eventId, options = {}) {
  const windowRef = options.windowRef || (typeof window === "undefined" ? null : window);
  if (!windowRef || !eventId) return false;

  const storageKey = `${EVENT_STORAGE_PREFIX}:${eventName}:${eventId}`;
  const trackedInPage =
    windowRef[TRACKED_ONCE_KEY] || (windowRef[TRACKED_ONCE_KEY] = new Set());

  if (trackedInPage.has(storageKey)) return false;

  try {
    if (windowRef.localStorage?.getItem(storageKey) === "1") return false;
  } catch {
    // In-page deduplication still works when browser storage is unavailable.
  }

  if (!trackGoogleAnalyticsEvent(eventName, { windowRef })) return false;

  trackedInPage.add(storageKey);
  try {
    windowRef.localStorage?.setItem(storageKey, "1");
  } catch {
    // Analytics must never interrupt the quiz when browser storage is unavailable.
  }

  return true;
}

export function trackQuizStart(sessionId, options) {
  return trackGoogleAnalyticsEventOnce(
    GOOGLE_ANALYTICS_EVENTS.QUIZ_START,
    sessionId,
    options
  );
}

export function trackQuizComplete(sessionId, options) {
  return trackGoogleAnalyticsEventOnce(
    GOOGLE_ANALYTICS_EVENTS.QUIZ_COMPLETE,
    sessionId,
    options
  );
}

export function trackAdoptionLinkClick(options) {
  return trackGoogleAnalyticsEvent(
    GOOGLE_ANALYTICS_EVENTS.ADOPTION_LINK_CLICK,
    options
  );
}
