import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { securePost, HttpError, uuid, stringField } from "@/lib/security/http";
import { operationId } from "@/lib/security/ids";

function sha256(value: string) { return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex"); }

export const POST = securePost(async (req, body) => {
  const { session, admin, quiz } = await requirePublicQuiz(req);
  const quizId = quiz.id;
  if (body.quizId !== quizId) throw new HttpError(403, "Not authorized");
  const definitionId = uuid(body.definitionId);
  const { data: definition } = await admin.from("quiz_tracking_events").select("*").eq("id", definitionId).eq("quiz_id", quizId).eq("enabled", true).eq("send_to_capi", true).maybeSingle();
  if (!definition) throw new HttpError(403, "Event not allowed");
  const eventName = definition.name === "Custom" ? definition.custom_name : definition.name;
  if (typeof eventName !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(eventName)) throw new HttpError(400, "Invalid configured event");
  const eventId = definition.id + "-" + session.sessionId;
  const email = stringField(body.email, 254);
  const phone = stringField(body.phone, 40);
  const sourceUrl = new URL("/q/" + encodeURIComponent(quiz.slug), req.url).href;
  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("quiz_tracking_settings").select("meta_pixel_id").eq("quiz_id", quizId).maybeSingle(),
    admin.from("quiz_tracking_secrets").select("meta_access_token").eq("quiz_id", quizId).maybeSingle(),
  ]);
  const pixelId = settings?.meta_pixel_id;
  const token = secret?.meta_access_token;
  if (!pixelId || !/^\d{5,30}$/.test(pixelId) || !token) {
    return NextResponse.json({ ok: false, error: "meta not configured" });
  }

  const { error: claimError } = await admin.from("quiz_tracking_activity").insert({
    id: operationId("capi:" + definitionId, session.sessionId), quiz_id: quizId,
    message: "התחילה שליחת אירוע " + eventName,
  });
  if (claimError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (claimError) throw new HttpError(503, "Could not claim event");

  const userData: Record<string, unknown> = {
    client_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    client_user_agent: req.headers.get("user-agent") ?? undefined,
  };
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone.replace(/\D/g, ""))];

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        data: [
          {
            event_name: eventName,
            event_id: eventId,
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: sourceUrl,
            user_data: userData,
            custom_data: definition.value != null ? { value: definition.value, currency: definition.currency || "ILS" } : undefined,
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json({ ok: false, error: `Meta rejected event (HTTP ${res.status})` });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "שגיאת רשת" });
  }
});
