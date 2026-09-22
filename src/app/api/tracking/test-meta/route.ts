import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireQuizOwner } from "@/lib/security/owner";
import { securePost, uuid } from "@/lib/security/http";

export const POST = securePost(async (_req, body) => {
  const quizId = uuid(body.quizId);
  await requireQuizOwner(quizId);
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
    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
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

    if (!res.ok || data.error) {
      const message = `Meta rejected the test (HTTP ${res.status})`;
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
