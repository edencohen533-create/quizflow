import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchQuizFullBySlug } from "@/lib/supabase/queries";
import { QuizRunner } from "@/components/runtime/quiz-runner";
import { GOOGLE_FONT_STYLESHEET } from "@/lib/quiz-fonts";

export default async function PublicQuizPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  // Next.js does not URL-decode dynamic route segments, so a Hebrew slug
  // (the default for a Hebrew-named quiz) arrives here still percent-encoded
  // and would never match the plain slug stored in the database.
  const slug = decodeURIComponent(rawSlug);
  const supabase = await createClient();
  const quiz = await fetchQuizFullBySlug(supabase, slug);

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        השאלון לא נמצא
      </div>
    );
  }

  const fontHref = GOOGLE_FONT_STYLESHEET[quiz.theme.fontFamily];

  return (
    <Suspense>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <QuizRunner quiz={quiz} />
    </Suspense>
  );
}
