import { submissionPath } from "@/lib/security/submission-path";
import { NextResponse } from "next/server";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { securePost, HttpError, stringField } from "@/lib/security/http";
import { normalizeAnswers } from "@/lib/security/answers";

export const POST = securePost(async (req, body) => {
  const { session, admin, quiz } = await requirePublicQuiz(req);
  if (body.quizId !== quiz.id || body.sessionId !== session.sessionId) throw new HttpError(403, "Not authorized");
  const nodeId = stringField(body.currentNodeId, 128, true);
  const node = quiz.nodes.find((n) => n.id === nodeId);
  if (!node || !["active", "completed"].includes(String(body.status))) throw new HttpError(400, "Invalid step");
  const answers = normalizeAnswers(body.answers ?? [], quiz.nodes);
  if (body.status === "completed") {
    const path = submissionPath(quiz, answers, session.sessionId, stringField(body.utmSource, 256));
    if (path.at(-1)?.id !== node.id) throw new HttpError(400, "Invalid completion");
  }
  const score = answers.reduce((sum, a) => sum + a.score, 0);
  const now = new Date().toISOString();
  const row = {
    id: session.sessionId, quiz_id: quiz.id, workspace_id: quiz.workspaceId, quiz_name: quiz.name,
    step_index: answers.length,
    total_steps: quiz.nodes.filter((n) => ["question", "name", "lead_details"].includes(n.type)).length,
    current_node_id: node.id,
    current_node_title: "title" in node.data ? node.data.title : node.data.kind === "message" ? node.data.text : node.type,
    status: body.status as "active" | "completed",
    name: stringField(body.name, 200) || null, phone: stringField(body.phone, 40) || null, email: stringField(body.email, 254) || null,
    score, category: score >= 26 ? "hot" : score >= 16 ? "warm" : "cold",
    utm_source: stringField(body.utmSource, 256) || null,
    utm_medium: stringField(body.utmMedium, 256) || null,
    utm_campaign: stringField(body.utmCampaign, 256) || null,
    answers, last_event_at: now, completed_at: body.status === "completed" ? now : null,
  };
  const { error: insertError } = await admin.from("quiz_sessions").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (insertError) throw new HttpError(503, "Could not start session");
  // A delayed heartbeat must never reopen a completed session.
  const { error } = await admin.from("quiz_sessions").update(row)
    .eq("id", session.sessionId).eq("quiz_id", quiz.id).eq("workspace_id", quiz.workspaceId).neq("status", "completed");
  if (error) throw new HttpError(503, "Could not update session");
  return NextResponse.json({ ok: true });
});
