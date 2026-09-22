import { headers } from "next/headers";
import { sharedBudget } from "@/lib/security/shared-rate-limit";
import { notFound } from "next/navigation";
import { issuePublicSession } from "@/lib/security/session";
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
  let slug: string;
  try { slug = decodeURIComponent(rawSlug); } catch { notFound(); }
  const incoming = await headers();
  const budgetRequest = new Request("https://quizflow.invalid/q/", { headers: incoming });
  if (!await sharedBudget(budgetRequest,"public-session",60)) return <main dir="rtl">יותר מדי בקשות. נסו שוב בעוד דקה.</main>;
  const supabase = await createClient();
  const quiz = await fetchQuizFullBySlug(supabase, slug);

  if (!quiz) notFound();
  const session = quiz.status === "active" ? issuePublicSession(quiz.id, quiz.workspaceId) : undefined;

  const fontHref = GOOGLE_FONT_STYLESHEET[quiz.theme.fontFamily];

  return (
    <Suspense>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <QuizRunner quiz={quiz} session={session} />
    </Suspense>
  );
}
