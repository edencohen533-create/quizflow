"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuizSession, QuizSessionDisplayStatus, SESSION_STATUS_LABELS } from "@/lib/types";
import { displaySessionStatus, timeAgoLabel } from "@/lib/quiz-session-status";

const FILTERS: { id: "all" | QuizSessionDisplayStatus; label: string }[] = [
  { id: "all", label: "כל השיחות" },
  { id: "live", label: "פעיל עכשיו" },
  { id: "abandoned", label: "ננטשו" },
  { id: "completed", label: "הושלמו" },
];

const DOT_CLASS: Record<QuizSessionDisplayStatus, string> = {
  live: "bg-emerald-500 animate-pulse",
  abandoned: "bg-amber-500",
  completed: "bg-primary",
};

export function SessionList({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: QuizSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | QuizSessionDisplayStatus>("all");
  const [quizFilter, setQuizFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // re-render every few seconds so "live"/"abandoned" and relative times stay fresh
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  const quizOptions = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => s.quizName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "he"));
  }, [sessions]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const status = displaySessionStatus(s, nowMs);
      if (filter !== "all" && status !== filter) return false;
      if (quizFilter !== "all" && s.quizName !== quizFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${s.name ?? ""} ${s.quizName} ${s.currentNodeTitle ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, filter, quizFilter, search, nowMs]);

  const liveCount = useMemo(() => sessions.filter((s) => displaySessionStatus(s, nowMs) === "live").length, [sessions, nowMs]);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <div className="border-b p-3">
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            {liveCount} פעילים עכשיו
          </span>
        </div>
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לקוח..."
            className="h-9 pr-8 text-sm"
          />
        </div>
        <Select
          value={quizFilter}
          onValueChange={(v) => setQuizFilter(v ?? "all")}
          items={{ all: "כל השאלונים", ...Object.fromEntries(quizOptions.map((q) => [q, q])) }}
        >
          <SelectTrigger className="mt-2 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל השאלונים</SelectItem>
            {quizOptions.map((q) => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">אין שיחות תואמות</p>}
        {filtered.map((s) => {
          const status = displaySessionStatus(s, nowMs);
          const isSelected = s.id === selectedId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`flex w-full items-start gap-3 border-b px-3 py-3 text-start transition-colors hover:bg-accent ${
                isSelected ? "bg-accent" : ""
              }`}
            >
              <div className="relative shrink-0">
                <Avatar className="size-10">
                  <AvatarFallback>{s.name ? s.name.slice(0, 2) : <User className="size-4" />}</AvatarFallback>
                </Avatar>
                <span className={`absolute -bottom-0.5 -left-0.5 size-3 rounded-full border-2 border-card ${DOT_CLASS[status]}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{s.name || "מבקר אנונימי"}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgoLabel(s.lastEventAt, nowMs)}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{s.quizName}</p>
                <p className="mt-0.5 truncate text-xs">
                  {status === "completed" ? "השלים/ה את השאלון" : `שלב ${s.stepIndex}/${s.totalSteps || "?"} · ${s.currentNodeTitle ?? ""}`}
                </p>
                <span className="mt-1 inline-block text-[10px] font-medium text-muted-foreground">{SESSION_STATUS_LABELS[status]}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
