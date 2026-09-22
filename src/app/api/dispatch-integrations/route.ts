import { NextResponse } from "next/server";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { securePost, HttpError } from "@/lib/security/http";
import { sendWebhook } from "@/lib/security/webhook";
import { operationId } from "@/lib/security/ids";

export const POST = securePost(async (req, body) => {
  const { session, admin, quiz } = await requirePublicQuiz(req);
  if (body.leadId !== session.leadId) throw new HttpError(403, "Not authorized");
  const leadId = session.leadId;
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, workspace_id, quiz_id, name, phone, email, score, category, utm_source, utm_medium, utm_campaign, created_at, quizzes(name)")
    .eq("id", leadId)
    .eq("workspace_id", quiz.workspaceId)
    .eq("quiz_id", quiz.id)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  }

  const { data: submission } = await admin
    .from("quiz_submissions")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("id", session.submissionId)
    .eq("quiz_id", quiz.id)
    .maybeSingle();

  if (!submission) throw new HttpError(409, "Submission not ready");

  const { data: answerRows } = submission
    ? await admin.from("submission_answers").select("node_id, question_title, answer_label, param_key").eq("submission_id", submission.id)
    : { data: [] as { node_id: string; question_title: string | null; answer_label: string | null; param_key: string | null }[] };

  const answerData: Record<string, string | null> = {};
  for (const a of answerRows ?? []) {
    answerData[a.param_key || a.node_id] = a.answer_label;
  }

  const { data: integrations } = await admin
    .from("integrations")
    .select("*")
    .eq("quiz_id", quiz.id)
    .eq("workspace_id", quiz.workspaceId)
    .eq("enabled", true);

  const { error: claimError } = await admin.from("quiz_tracking_activity").insert({
    id: operationId("dispatch", session.leadId), quiz_id: quiz.id,
    message: "התחילה שליחת אינטגרציות לליד",
  });
  if (claimError?.code === "23505") return NextResponse.json({ ok: true, pixels: [], duplicate: true });
  if (claimError) throw new HttpError(503, "Could not claim delivery");

  const pixels: { kind: "meta_pixel" | "tiktok_pixel"; pixelId: string }[] = [];

  for (const integration of integrations ?? []) {
    if (integration.kind === "webhook" && integration.url) {
      const extraParams: { key: string; value: string }[] = integration.extra_params ?? [];
      try {
        const res = await sendWebhook(integration.url, {
            leadId: lead.id,
            quizId: lead.quiz_id,
            quizName: (lead.quizzes as unknown as { name: string } | null)?.name,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            score: lead.score,
            category: lead.category,
            utmSource: lead.utm_source,
            utmMedium: lead.utm_medium,
            utmCampaign: lead.utm_campaign,
            createdAt: lead.created_at,
            data: answerData,
            params: Object.fromEntries(extraParams.map((p) => [p.key, p.value])),
          }, integration.secret);
        await admin
          .from("integrations")
          .update({ last_triggered_at: new Date().toISOString(), last_status: res.ok ? "success" : "error", last_error: res.ok ? null : `HTTP ${res.status}` })
          .eq("id", integration.id);
      } catch {
        await admin
          .from("integrations")
          .update({
            last_triggered_at: new Date().toISOString(),
            last_status: "error",
            last_error: "שליחת Webhook נכשלה",
          })
          .eq("id", integration.id);
      }
    } else if ((integration.kind === "meta_pixel" || integration.kind === "tiktok_pixel") && integration.pixel_id) {
      pixels.push({ kind: integration.kind, pixelId: integration.pixel_id });
    }
  }

  return NextResponse.json({ ok: true, pixels });
});
