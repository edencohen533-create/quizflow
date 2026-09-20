import { QuizTrackingEvent, QuizTrackingSettings, TrackingCondition } from "@/lib/types";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    _qfTrackingLoaded?: { pixel?: string; gtm?: string };
  }
}

export function generateEventId(definitionId: string, sessionId: string) {
  return `${definitionId}-${sessionId}`;
}

function loadMetaPixelScript(pixelId: string) {
  if (typeof window === "undefined") return;
  window._qfTrackingLoaded = window._qfTrackingLoaded || {};
  if (window._qfTrackingLoaded.pixel === pixelId) return;
  window._qfTrackingLoaded.pixel = pixelId;
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any) {
    if (f.fbq) return;
    var n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    var t = b.createElement(e);
    t.async = true;
    t.src = v;
    var s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq?.("init", pixelId);
}

export function injectGtm(containerId: string) {
  if (typeof window === "undefined") return;
  window._qfTrackingLoaded = window._qfTrackingLoaded || {};
  if (window._qfTrackingLoaded.gtm === containerId) return;
  window._qfTrackingLoaded.gtm = containerId;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
  document.head.appendChild(script);

  const noscript = document.createElement("noscript");
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${containerId}`;
  iframe.height = "0";
  iframe.width = "0";
  iframe.style.display = "none";
  iframe.style.visibility = "hidden";
  noscript.appendChild(iframe);
  document.body.appendChild(noscript);
}

function pushDataLayer(eventName: string, params: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "quizflow_conversion", quizflow_event_name: eventName, ...params });
}

function evaluateCondition(condition: TrackingCondition | undefined, context: Record<string, string | number | undefined>): boolean {
  if (!condition) return true;
  const actual = context[condition.field];
  if (actual === undefined) return false;
  const expected = condition.value;
  switch (condition.operator) {
    case "eq":
      return String(actual) === expected;
    case "neq":
      return String(actual) !== expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    default:
      return true;
  }
}

interface FireContext {
  sessionId: string;
  quizId: string;
  settings: QuizTrackingSettings;
  phone?: string;
  email?: string;
  conditionContext?: Record<string, string | number | undefined>;
}

export function fireTrackingEvent(def: QuizTrackingEvent, ctx: FireContext) {
  if (!def.enabled) return;
  if (!evaluateCondition(def.condition, ctx.conditionContext ?? {})) return;

  const eventName = def.name === "Custom" ? def.customName || "CustomEvent" : def.name;
  const eventId = generateEventId(def.id, ctx.sessionId);

  if (def.sendToPixel && ctx.settings.metaPixelId) {
    loadMetaPixelScript(ctx.settings.metaPixelId);
    window.fbq?.(
      "track",
      eventName,
      def.value != null ? { value: def.value, currency: def.currency || "ILS" } : {},
      { eventID: eventId }
    );
  }

  if (def.sendToGtm && ctx.settings.gtmContainerId) {
    injectGtm(ctx.settings.gtmContainerId);
    pushDataLayer(eventName, { value: def.value, currency: def.currency, event_id: eventId });
  }

  if (def.sendToCustomCode && def.customCode) {
    try {
      new Function(def.customCode)();
    } catch (err) {
      console.error("QuizFlow custom tracking code failed:", err);
    }
  }

  if (def.sendToCapi && ctx.settings.metaHasToken) {
    fetch("/api/tracking/fire-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizId: ctx.quizId,
        eventName,
        eventId,
        value: def.value,
        currency: def.currency,
        phone: ctx.phone,
        email: ctx.email,
        sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    }).catch(() => {});
  }
}
