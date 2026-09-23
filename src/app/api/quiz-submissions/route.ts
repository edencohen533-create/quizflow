import { submissionPath } from "@/lib/security/submission-path";
import { after } from "next/server";
import { processDeliveryJobs } from "@/lib/security/delivery";
import { NextResponse } from "next/server";
import { securePost, HttpError, isRecord, stringField } from "@/lib/security/http";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { normalizeAnswers } from "@/lib/security/answers";
import { operationId } from "@/lib/security/ids";
import { isValidIsraeliPhone } from "@/lib/quiz-runtime";

export const POST = securePost(async (req, body) => {
  const { session, admin, quiz } = await requirePublicQuiz(req);
  if (!isRecord(body.lead)) throw new HttpError(400, "Invalid lead");
  const lead = body.lead;
  const name = stringField(lead.name, 200);
  const phone = stringField(lead.phone, 40);
  const email = stringField(lead.email, 254);
  if (!name && !phone && !email) throw new HttpError(400, "Contact details required");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Invalid email");
  const answers = normalizeAnswers(body.answers, quiz.nodes);
  const path = submissionPath(quiz, answers, session.sessionId, stringField(lead.utmSource,256));
  const detailNodes = path.filter((n) => n.data.kind === "lead_details").map((n) => n.data);
  for (const data of detailNodes) {
    if (data.kind !== "lead_details") continue;
    if (data.showEmail && data.requireEmail && !email) throw new HttpError(400, "Email required");
    if (data.showConsent && lead.consent !== true) throw new HttpError(400, "Consent required");
    if (data.showPhone && data.requirePhoneIL && !isValidIsraeliPhone(phone)) throw new HttpError(400, "Invalid phone");
  }
  const score = answers.reduce((sum, a) => sum + a.score, 0);
  const thresholds = quiz.nodes.find((n) => n.data.kind === "score")?.data;
  const hot = thresholds?.kind === "score" ? thresholds.hotThreshold : 26;
  const warm = thresholds?.kind === "score" ? thresholds.warmThreshold : 16;
  const category = score >= hot ? "hot" : score >= warm ? "warm" : "cold";
  const attribution = {
    utm_source: stringField(lead.utmSource, 256) || null,
    utm_medium: stringField(lead.utmMedium, 256) || null,
    utm_campaign: stringField(lead.utmCampaign, 256) || null,
  };
  const { error } = await admin.rpc("submit_quiz_response", {
    p_lead: {
      id: session.leadId, workspace_id: quiz.workspaceId, quiz_id: quiz.id,
      name, phone, email, score, category, ...attribution,
      utm_content: stringField(lead.utmContent, 256) || null,
    },
    p_submission: { id: session.submissionId, quiz_id: quiz.id, lead_id: session.leadId, score, category, ...attribution },
    p_answers: answers.map((a) => ({
      id: operationId("answer:" + a.nodeId, session.submissionId),
      node_id: a.nodeId, question_title: a.questionTitle, answer_label: a.answerLabel,
      score: a.score, param_key: a.paramKey || null,
    })),
  });
  if (error) throw new HttpError(503, "Could not save submission");
  after(() => processDeliveryJobs());
  return NextResponse.json({ ok: true, leadId: session.leadId });
});
