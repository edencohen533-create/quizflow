import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireQuizOwner } from "@/lib/security/owner";
import { HttpError, securePost, uuid } from "@/lib/security/http";

export const POST = securePost(async (_req, body) => {
  const quizId = uuid(body.quizId);
  await requireQuizOwner(quizId);
  const testEventCode = typeof body.testEventCode === "string" ? body.testEventCode.trim() : "";
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(testEventCode)) {
    throw new HttpError(400, "יש להזין קוד בדיקה מתוך Test Events ב-Meta Events Manager");
  }
  const admin = createAdminClient();
  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("quiz_tracking_settings").select("meta_pixel_id").eq("quiz_id", quizId).maybeSingle(),
    admin.from("quiz_tracking_secrets").select("meta_access_token").eq("quiz_id", quizId).maybeSingle(),
  ]);

  const pixelId = settings?.meta_pixel_id;
  const token = secret?.meta_access_token;
  const now = new Date().toISOString();

  if (!pixelId || !/^\d{5,30}$/.test(pixelId) || !token) {
    await admin
      .from("quiz_tracking_settings")
      .upsert({ quiz_id: quizId, meta_last_test_status: "error", meta_last_test_error: "חסר Pixel ID או Access Token", meta_last_test_at: now });
    return NextResponse.json({ ok: false, error: "חסר Pixel ID או Access Token" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}/${pixelId}/events`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        test_event_code: testEventCode,
        data: [
          {
            event_name: "TestEvent",
            event_time: Math.floor(Date.now() / 1000),
            event_id: crypto.randomUUID(),
            action_source: "system_generated",
            user_data: { client_user_agent: "QuizFlow-Tracking-Test/1.0" },
          },
        ],
      }),
    });
    const data = await res.json();

    if (!res.ok || data.error || !(Number(data.events_received) > 0)) {
      const message = data.error?.code === 190 ? "טוקן Meta אינו תקף. יש לעדכן אותו ולנסות שוב." : data.error?.code === 100 ? "יש לבדוק את Pixel ID ואת הרשאות הטוקן ב-Meta." : `Meta לא אישרה קליטת אירוע הבדיקה (HTTP ${res.status})`;
      await admin
        .from("quiz_tracking_settings")
        .upsert({ quiz_id: quizId, meta_last_test_status: "error", meta_last_test_error: message, meta_last_test_at: now });
      return NextResponse.json({ ok: false, error: message });
    }

    await admin
      .from("quiz_tracking_settings")
      .upsert({ quiz_id: quizId, meta_last_test_status: "success", meta_last_test_error: null, meta_last_test_at: now });
    return NextResponse.json({ ok: true });
  } catch {
    const message = "שגיאת רשת";
    await admin
      .from("quiz_tracking_settings")
      .upsert({ quiz_id: quizId, meta_last_test_status: "error", meta_last_test_error: message, meta_last_test_at: now });
    return NextResponse.json({ ok: false, error: message });
  }
});
