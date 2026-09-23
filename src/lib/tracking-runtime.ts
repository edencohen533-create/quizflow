import { sendMetaPixelEvent } from "@/lib/meta-pixel";
import { sendSandboxTracking } from "@/lib/tracking-sandbox";
import { QuizTrackingEvent, QuizTrackingSettings, TrackingCondition } from "@/lib/types";

export function generateEventId(definitionId: string, sessionId: string) {
  return `${definitionId}-${sessionId}`;
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
  sessionToken?: string;
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
    sendMetaPixelEvent(
      ctx.settings.metaPixelId, eventName, def.name === "Custom",
      def.value != null ? { value: def.value, currency: def.currency || "ILS" } : {},
      eventId,
    );
  }

  if (def.sendToGtm && ctx.settings.gtmContainerId) {
    sendSandboxTracking("gtm:" + ctx.quizId, { event: { event: "quizflow_conversion", quizflow_event_name: eventName, value: def.value, currency: def.currency, event_id: eventId } }, ctx.settings.gtmContainerId);
  }

  if (def.sendToCustomCode && def.customCode) {
    sendSandboxTracking("custom:" + ctx.quizId, { code: def.customCode }, undefined, ctx.settings.metaPixelId);
  }

  if (def.sendToCapi && ctx.settings.metaHasToken && ctx.sessionToken) {
    fetch("/api/tracking/fire-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ctx.sessionToken },
      body: JSON.stringify({
        quizId: ctx.quizId,
        definitionId: def.id,
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
