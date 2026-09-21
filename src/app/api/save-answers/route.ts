import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let body: { submissionId?: string; answers?: { nodeId: string; questionTitle: string; answerLabel: string; score: number; paramKey?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { submissionId, answers } = body;
  if (!submissionId || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ ok: false, error: "missing submissionId or answers" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("submission_answers").insert(
    answers.map((a) => ({
      submission_id: submissionId,
      node_id: a.nodeId,
      question_title: a.questionTitle,
      answer_label: a.answerLabel,
      score: a.score,
      param_key: a.paramKey || null,
    }))
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
