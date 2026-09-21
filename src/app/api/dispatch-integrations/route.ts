import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let body: { leadId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const { leadId } = body;
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing leadId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, workspace_id, quiz_id, name, phone, email, score, category, utm_source, utm_medium, utm_campaign, created_at, quizzes(name)")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  }

  const { data: submission } = await admin
    .from("quiz_submissions")
    .select("id")
    .eq("lead_id", lead.id)
    .maybeSingle();

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
    .eq("workspace_id", lead.workspace_id)
    .eq("enabled", true);

  const pixels: { kind: "meta_pixel" | "tiktok_pixel"; pixelId: string }[] = [];

  for (const integration of integrations ?? []) {
    if (integration.kind === "webhook" && integration.url) {
      try {
        const res = await fetch(integration.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(integration.secret ? { "X-QuizFlow-Secret": integration.secret } : {}),
          },
          body: JSON.stringify({
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
          }),
        });
        await admin
          .from("integrations")
          .update({ last_triggered_at: new Date().toISOString(), last_status: res.ok ? "success" : "error", last_error: res.ok ? null : `HTTP ${res.status}` })
          .eq("id", integration.id);
      } catch (err) {
        await admin
          .from("integrations")
          .update({
            last_triggered_at: new Date().toISOString(),
            last_status: "error",
            last_error: err instanceof Error ? err.message : "שליחה נכשלה",
          })
          .eq("id", integration.id);
      }
    } else if ((integration.kind === "meta_pixel" || integration.kind === "tiktok_pixel") && integration.pixel_id) {
      pixels.push({ kind: integration.kind, pixelId: integration.pixel_id });
    }
  }

  return NextResponse.json({ ok: true, pixels });
}
