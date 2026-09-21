"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Copy,
  Trash2,
  Pencil,
  Users,
  BarChart3,
  MoreVertical,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuizStatusBadge } from "@/components/shared/status-badges";
import { CreateQuizDialog } from "@/components/quizzes/create-quiz-dialog";
import { createClient } from "@/lib/supabase/client";
import { deleteQuiz, duplicateQuiz, listLeads, listQuizzes, updateQuizMeta } from "@/lib/supabase/queries";
import { useWorkspaceId } from "@/components/layout/workspace-provider";
import { seedDemoQuiz } from "@/lib/demo-seed";
import { Lead, Quiz, QuizStatus } from "@/lib/types";

function QuizzesPageInner() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const workspaceId = useWorkspaceId();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(searchParams.get("new") === "1");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuizStatus | "all">("all");
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const [q, l] = await Promise.all([listQuizzes(supabase, workspaceId), listLeads(supabase, workspaceId)]);
    setQuizzes(q);
    setLeads(l);
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return quizzes.filter((q) => {
      const matchesQuery = q.name.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || q.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [quizzes, query, statusFilter]);

  function leadsCountFor(quizId: string) {
    return leads.filter((l) => l.quizId === quizId).length;
  }

  function completionsThisMonthFor(quizId: string) {
    const now = new Date();
    return leads.filter((l) => {
      if (l.quizId !== quizId) return false;
      const d = new Date(l.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }

  async function handleDuplicate(quiz: Quiz) {
    await duplicateQuiz(supabase, quiz);
    load();
  }

  async function handleSeedDemo() {
    if (!workspaceId || seeding) return;
    setSeeding(true);
    await seedDemoQuiz(supabase, workspaceId);
    setSeeding(false);
    load();
  }

  async function handleDelete(quizId: string) {
    setQuizzes((qs) => qs.filter((q) => q.id !== quizId));
    await deleteQuiz(supabase, quizId);
  }

  async function handleToggleStatus(quizId: string, checked: boolean) {
    const nextStatus: QuizStatus = checked ? "active" : "paused";
    setQuizzes((qs) => qs.map((q) => (q.id === quizId ? { ...q, status: nextStatus } : q)));
    await updateQuizMeta(supabase, quizId, { status: nextStatus });
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">שאלונים</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          שאלון חדש
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש שאלון..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pe-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as QuizStatus | "all")}
          items={{ all: "כל הסטטוסים", draft: "טיוטה", active: "פעיל", paused: "מושהה" }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="draft">טיוטה</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="paused">מושהה</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground space-y-3">
            <p>{quizzes.length === 0 ? "עדיין אין שאלונים — צור את הראשון שלך" : "לא נמצאו שאלונים תואמים"}</p>
            {quizzes.length === 0 && (
              <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={seeding}>
                {seeding && <Loader2 className="size-3.5 animate-spin" />}
                טען שאלון לדוגמה עם 15 לידים
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((quiz) => {
            const quizLeads = leadsCountFor(quiz.id);
            const completions = completionsThisMonthFor(quiz.id);
            const conversionRate = quizLeads ? Math.round((completions / Math.max(quizLeads, 1)) * 100) : 0;
            return (
              <Card key={quiz.id} className="flex flex-col">
                <CardContent className="flex-1 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/quizzes/${quiz.id}`} className="font-semibold hover:underline">
                        {quiz.name}
                      </Link>
                      <div className="mt-1"><QuizStatusBadge status={quiz.status} /></div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="size-8 shrink-0">
                            <MoreVertical className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDuplicate(quiz)}>
                          <Copy className="size-4" /> שכפל
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => handleDelete(quiz.id)}>
                          <Trash2 className="size-4" /> מחק
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-lg bg-muted/60 py-2">
                      <p className="flex items-center justify-center gap-1 font-semibold">
                        <Users className="size-3.5" /> {quizLeads}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">לידים</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 py-2">
                      <p className="font-semibold">{completions}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">השלמות החודש</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 py-2">
                      <p className="flex items-center justify-center gap-1 font-semibold">
                        <BarChart3 className="size-3.5" /> {conversionRate}%
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">המרה</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    עודכן: {new Date(quiz.updatedAt).toLocaleDateString("he-IL")}
                  </p>

                  <div className="mt-auto flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={quiz.status === "active"}
                        onCheckedChange={(checked) => handleToggleStatus(quiz.id, checked)}
                      />
                      <span className="text-xs text-muted-foreground">הפעלה</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link href={`/quizzes/${quiz.id}`}>
                          <Pencil className="size-3.5" />
                          כניסה לעריכה
                        </Link>
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {workspaceId && (
        <CreateQuizDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={workspaceId} onCreated={load} />
      )}
    </div>
  );
}

export default function QuizzesPage() {
  return (
    <Suspense>
      <QuizzesPageInner />
    </Suspense>
  );
}
