import { NextResponse } from "next/server";
import { securePost, HttpError, stringField } from "@/lib/security/http";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { operationId } from "@/lib/security/ids";
export const POST = securePost(async (req, body) => {
  const { quiz, session, admin } = await requirePublicQuiz(req);
  if (!["view", "start", "complete"].includes(String(body.eventType))) throw new HttpError(400, "Invalid event");
  const { error } = await admin.from("analytics_events").upsert({
    id: operationId("analytics:" + body.eventType, session.sessionId),
    quiz_id: quiz.id, event_type: body.eventType, utm_source: stringField(body.utmSource, 256) || null,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new HttpError(503, "Could not record event");
  return NextResponse.json({ ok: true });
});
