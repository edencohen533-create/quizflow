import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchQuizFull } from "@/lib/supabase/queries";
import { QuizEditorClient } from "./quiz-editor-client";

export default async function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const quiz = await fetchQuizFull(supabase, id);

  if (!quiz) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>השאלון לא נמצא</p>
        <Link href="/quizzes" className="text-primary hover:underline text-sm">חזרה לשאלונים</Link>
      </div>
    );
  }

  return <QuizEditorClient initialQuiz={quiz} />;
}
