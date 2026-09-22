import { createClient } from "@/lib/supabase/server";
import { HttpError } from "./http";

export async function requireQuizOwner(quizId: string) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, "Authentication required");
  // Published quizzes are publicly readable, so quiz existence is NOT ownership.
  const { data: quiz } = await supabase.from("quizzes").select("id, workspace_id").eq("id", quizId).maybeSingle();
  if (!quiz) throw new HttpError(403, "Not authorized");
  const { data: workspace } = await supabase.from("workspaces").select("id").eq("id", quiz.workspace_id).eq("owner_id", user.id).maybeSingle();
  if (!workspace) throw new HttpError(403, "Not authorized");
  return { supabase, quiz, user };
}
