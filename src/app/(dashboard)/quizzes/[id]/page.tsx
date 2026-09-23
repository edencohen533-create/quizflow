import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchQuizFull } from "@/lib/supabase/queries";
import { QuizEditorClient } from "./quiz-editor-client";

export default async function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) notFound();
  const quiz = await fetchQuizFull(supabase, id);
  if(!quiz) notFound();
  // Active quiz visibility is public; the editor still requires ownership.
  const {data:workspace,error}=await supabase.from("workspaces").select("id").eq("id",quiz.workspaceId).eq("owner_id",user.id).maybeSingle();
  if(error) throw new Error("Could not verify workspace");
  if(!workspace) notFound();
  return <QuizEditorClient initialQuiz={quiz} />;
}
