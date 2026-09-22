import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireQuizOwner } from "@/lib/security/owner";
import { securePost, uuid, stringField } from "@/lib/security/http";

export const POST = securePost(async (_req, body) => {
  const quizId = uuid(body.quizId);
  const token = stringField(body.token, 4096, true);
  await requireQuizOwner(quizId);
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: secretError } = await admin
    .from("quiz_tracking_secrets")
    .upsert({ quiz_id: quizId, meta_access_token: token, updated_at: now });
  if (secretError) {
    return NextResponse.json({ ok: false, error: "Could not save token" }, { status: 500 });
  }
  const { error: settingsError } = await admin.from("quiz_tracking_settings").upsert({ quiz_id: quizId, meta_has_token: true, updated_at: now });
  if (settingsError) return NextResponse.json({ ok: false, error: "Could not save settings" }, { status: 503 });

  return NextResponse.json({ ok: true });
});
