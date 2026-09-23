"use client";
import { validatePublishableFlow } from "@/lib/quiz-runtime";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft, Eye, Save, Rocket, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { QuizStatusBadge } from "@/components/shared/status-badges";
import { createClient } from "@/lib/supabase/client";
import { fetchQuizFull, updateQuizMeta } from "@/lib/supabase/queries";
import { FlowEditor } from "@/components/editor/flow-editor";
import { Quiz } from "@/lib/types";
import { toast } from "sonner";

// Each of these tab bodies (and their heavy deps, e.g. recharts for
// AnalyticsTab) is only needed once its tab is actually opened — base-ui's
// Tabs already don't mount inactive panels, so lazy-loading the component
// itself keeps its code out of this route's initial JS entirely.
function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
const DesignTab = dynamic(() => import("@/components/editor/design-tab").then((m) => m.DesignTab), {
  ssr: false,
  loading: TabLoading,
});
const AnalyticsTab = dynamic(() => import("@/components/editor/analytics-tab").then((m) => m.AnalyticsTab), {
  ssr: false,
  loading: TabLoading,
});
const ShareTab = dynamic(() => import("@/components/editor/share-tab").then((m) => m.ShareTab), {
  ssr: false,
  loading: TabLoading,
});
const TrackingTab = dynamic(() => import("@/components/editor/tracking-tab").then((m) => m.TrackingTab), {
  ssr: false,
  loading: TabLoading,
});

// Takes the quiz as a prop, already fetched server-side by page.tsx, instead
// of fetching it itself on mount — the old version left the whole screen on
// a loading spinner until JS hydrated AND a client round trip to Supabase
// resolved, even though the data was knowable at request time.
export function QuizEditorClient({ initialQuiz }: { initialQuiz: Quiz }) {
  const supabase = useMemo(() => createClient(), []);
  const [quiz, setQuiz] = useState<Quiz>(initialQuiz);
  const [nameDraft, setNameDraft] = useState(initialQuiz.name);
  const flowSaveRef = useRef<(() => Promise<void>) | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAgo, setSavedAgo] = useState<string | null>(null);

  async function handlePublish() {
    if (saving) return;
    setSaving(true);
    try {
    await flowSaveRef.current?.();
    await handleNameBlur();
    // re-fetch live flow state: FlowEditor autosaves nodes/edges directly to
    // Supabase without lifting them back into this component's `quiz` state,
    // so validating against `quiz.nodes` here would check a stale snapshot.
    const current = await fetchQuizFull(supabase, quiz.id);
    if (!current) return;
    const flowErrors = validatePublishableFlow(current);
    if (flowErrors.length) { toast.error(flowErrors.join("; ")); return; }
    await updateQuizMeta(supabase, quiz.id, { status: "active" });
    setQuiz({ ...current, status: "active" });
    toast.success("השאלון פורסם בהצלחה");
    } catch { toast.error("הפרסום נכשל. השינויים לא פורסמו."); }
    finally { setSaving(false); }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await flowSaveRef.current?.();
      await handleNameBlur();
      setSavedAgo("נשמר לפני רגע");
      toast.success("הטיוטה נשמרה");
    } catch { toast.error("שמירת הטיוטה נכשלה. נסו שוב."); }
    finally { setSaving(false); }
  }

  async function handleNameBlur() {
    if (!nameDraft.trim() || nameDraft === quiz.name) return;
    await updateQuizMeta(supabase, quiz.id, { name: nameDraft });
    setQuiz({ ...quiz, name: nameDraft });
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
            onBlur={() => { void handleNameBlur().catch(() => toast.error("שמירת השם נכשלה")); }}
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
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            <Save className="size-4" /> שמור טיוטה
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={saving}>
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
            <TabsTrigger value="analytics" className="data-[state=active]:bg-accent">אנליטיקה</TabsTrigger>
            <TabsTrigger value="share" className="data-[state=active]:bg-accent">שיתוף והטמעה</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="flow" keepMounted className="flex-1 min-h-0 m-0">
          <FlowEditor
            quizId={quiz.id}
            initialNodes={quiz.nodes}
            initialRevision={quiz.flowRevision ?? 0}
            initialEdges={quiz.edges}
            onSavedIndicator={setSavedAgo}
            saveRef={flowSaveRef}
          />
        </TabsContent>
        <TabsContent value="design" className="flex-1 min-h-0 m-0 overflow-auto">
          <DesignTab quiz={quiz} onThemeChange={(theme) => setQuiz({ ...quiz, theme })} />
        </TabsContent>
        <TabsContent value="tracking" className="flex-1 min-h-0 m-0 overflow-auto">
          <TrackingTab quiz={quiz} />
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
