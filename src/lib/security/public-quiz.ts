import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchQuizFull } from "@/lib/supabase/queries";
import { verifyPublicSession } from "./session";
import { HttpError } from "./http";

export async function requirePublicQuiz(req: Request) {
  const session = verifyPublicSession(req);
  const admin = createAdminClient();
  const quiz = await fetchQuizFull(admin, session.quizId);
  if (!quiz || quiz.status !== "active" || quiz.workspaceId !== session.workspaceId) throw new HttpError(403, "Quiz unavailable");
  return { session, admin, quiz };
}
