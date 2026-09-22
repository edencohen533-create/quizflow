import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireQuizOwner } from "@/lib/security/owner";
import { securePost, HttpError, uuid } from "@/lib/security/http";
import { sendWebhook } from "@/lib/security/webhook";

export const POST = securePost(async (_req, body) => {
  const integrationId = uuid(body.integrationId);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Authentication required");
  const { data: integration } = await supabase.from("integrations").select("*").eq("id", integrationId).maybeSingle();
  if (!integration?.quiz_id || integration.kind !== "webhook" || !integration.url) throw new HttpError(403, "Not authorized");
  const { quiz } = await requireQuizOwner(integration.quiz_id);
  if (quiz.workspace_id !== integration.workspace_id) throw new HttpError(403, "Not authorized");
  const result = await sendWebhook(integration.url, {
    test: true, message: "בדיקת חיבור מ-QuizFlow", sentAt: new Date().toISOString(),
    params: Object.fromEntries((integration.extra_params ?? []).map((p: { key: string; value: string }) => [p.key, p.value])),
  }, integration.secret);
  return NextResponse.json(result);
});
