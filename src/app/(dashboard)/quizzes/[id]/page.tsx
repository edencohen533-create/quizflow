"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Eye, Save, Rocket, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { QuizStatusBadge } from "@/components/shared/status-badges";
import { createClient } from "@/lib/supabase/client";
import { fetchQuizFull, updateQuizMeta } from "@/lib/supabase/queries";
import { FlowEditor } from "@/components/editor/flow-editor";
import { DesignTab } from "@/components/editor/design-tab";
import { AnalyticsTab } from "@/components/editor/analytics-tab";
import { ShareTab } from "@/components/editor/share-tab";
import { ComingSoonTab } from "@/components/editor/coming-soon-tab";
import { TrackingTab } from "@/components/editor/tracking-tab";
import { Quiz } from "@/lib/types";
import { toast } from "sonner";

export default function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState("");
  const [savedAgo, setSavedAgo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = await fetchQuizFull(supabase, id);
    setQuiz(q);
    if (q) setNameDraft(q.name);
  }, [supabase, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch on mount
    load();
  }, [load]);

  async function handlePublish() {
    if (!quiz) return;
    // re-fetch live flow state: FlowEditor autosaves nodes/edges directly to
    // Supabase without lifting them back into this component's `quiz` state,
    // so validating against `quiz.nodes` here would check a stale snapshot.
    const current = await fetchQuizFull(supabase, quiz.id);
    if (!current) return;
    const hasStart = current.nodes.some((n) => n.type === "start");
    const hasEnd = current.nodes.some((n) => n.type === "end");
    if (!hasStart || !hasEnd) {
      toast.error("לא ניתן לפרסם: חסר צומת התחלה או סיום בזרימה");
      return;
    }
    await updateQuizMeta(supabase, quiz.id, { status: "active" });
    setQuiz({ ...current, status: "active" });
    toast.success("השאלון פורסם בהצלחה");
  }

  async function handleNameBlur() {
    if (!quiz || !nameDraft.trim() || nameDraft === quiz.name) return;
    await updateQuizMeta(supabase, quiz.id, { name: nameDraft });
    setQuiz({ ...quiz, name: nameDraft });
  }

  if (quiz === undefined) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (quiz === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>השאלון לא נמצא</p>
        <Link href="/quizzes" className="text-primary hover:underline text-sm">חזרה לשאלונים</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between gap-4 border-b px-5 h-16 shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            nativeButton={false}
            render={
              <Link href="/quizzes">
                <ChevronLeft className="size-4" />
              </Link>
            }
          />
          <nav className="text-sm text-muted-foreground hidden md:block shrink-0">
            <Link href="/quizzes" className="hover:underline">שאלונים</Link>
            <span className="mx-1.5">/</span>
          </nav>
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleNameBlur}
            className="h-8 w-56 border-transparent bg-transparent px-1.5 font-semibold shadow-none hover:border-input focus-visible:border-input"
          />
          <QuizStatusBadge status={quiz.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savedAgo && <span className="text-xs text-muted-foreground hidden lg:inline">{savedAgo}</span>}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href={`/q/${quiz.slug}`} target="_blank" rel="noreferrer">
                <Eye className="size-4" /> תצוגה מקדימה
              </a>
            }
          />
          <Button variant="outline" size="sm" onClick={() => setSavedAgo("נשמר לפני רגע")}>
            <Save className="size-4" /> שמור טיוטה
          </Button>
          <Button size="sm" onClick={handlePublish}>
            <Rocket className="size-4" /> פרסום
          </Button>
        </div>
      </header>

      <Tabs defaultValue="flow" className="flex-1 min-h-0 flex flex-col gap-0">
        <div className="border-b px-5 shrink-0 bg-card">
          <TabsList className="bg-transparent h-11 p-0 gap-1">
            <TabsTrigger value="flow" className="data-[state=active]:bg-accent">זרימה</TabsTrigger>
            <TabsTrigger value="design" className="data-[state=active]:bg-accent">עיצוב</TabsTrigger>
            <TabsTrigger
              value="tracking"
              className="flex items-center gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400"
            >
              <Target className="size-3.5" /> טראקינג
            </TabsTrigger>
            <TabsTrigger value="integrations" className="data-[state=active]:bg-accent">אינטגרציות</TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-accent">אנליטיקה</TabsTrigger>
            <TabsTrigger value="share" className="data-[state=active]:bg-accent">שיתוף והטמעה</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="flow" className="flex-1 min-h-0 m-0">
          <FlowEditor
            quizId={quiz.id}
            initialNodes={quiz.nodes}
            initialEdges={quiz.edges}
            onSavedIndicator={setSavedAgo}
          />
        </TabsContent>
        <TabsContent value="design" className="flex-1 min-h-0 m-0 overflow-auto">
          <DesignTab quiz={quiz} onThemeChange={(theme) => setQuiz({ ...quiz, theme })} />
        </TabsContent>
        <TabsContent value="tracking" className="flex-1 min-h-0 m-0 overflow-auto">
          <TrackingTab quiz={quiz} />
        </TabsContent>
        <TabsContent value="integrations" className="flex-1 min-h-0 m-0 overflow-auto">
          <ComingSoonTab title="אינטגרציות" description="חיבור Webhook, Zapier ופיקסלים לשאלון הזה יתווסף בשלב הבא. בינתיים אפשר להגדיר Webhook כללי בעמוד האינטגרציות הראשי." />
        </TabsContent>
        <TabsContent value="analytics" className="flex-1 min-h-0 m-0 overflow-auto">
          <AnalyticsTab quiz={quiz} />
        </TabsContent>
        <TabsContent value="share" className="flex-1 min-h-0 m-0 overflow-auto">
          <ShareTab quiz={quiz} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
