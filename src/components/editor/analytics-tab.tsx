"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { listAnalyticsEvents, getQuestionDropoff, QuestionDropoff } from "@/lib/supabase/queries";
import { Quiz, QuizNode } from "@/lib/types";

const RANGE_OPTIONS = [
  { value: "today", label: "היום" },
  { value: "week", label: "שבוע" },
  { value: "month", label: "חודש" },
  { value: "30", label: "30 יום" },
  { value: "90", label: "90 יום" },
];

const RANGE_DAYS: Record<string, number> = { today: 1, week: 7, month: 30, "30": 30, "90": 90 };

const STEP_TYPES = new Set(["question", "name", "lead_details"]);

function stepLabel(node: QuizNode): string {
  switch (node.data.kind) {
    case "question":
    case "name":
      return node.data.title;
    case "lead_details":
      return "פרטי יצירת קשר";
    default:
      return node.id;
  }
}

function orderedSteps(quiz: Quiz): QuizNode[] {
  return quiz.nodes
    .filter((n) => STEP_TYPES.has(n.type))
    .sort((a, b) => a.position.x - b.position.x);
}

interface DayPoint {
  date: string;
  views: number;
  starts: number;
  completions: number;
}

export function AnalyticsTab({ quiz }: { quiz: Quiz }) {
  const supabase = useMemo(() => createClient(), []);
  const [range, setRange] = useState("30");
  const days = RANGE_DAYS[range] ?? 30;
  const [data, setData] = useState<DayPoint[]>([]);
  const [dropoff, setDropoff] = useState<QuestionDropoff | null>(null);

  const steps = useMemo(() => orderedSteps(quiz), [quiz]);

  useEffect(() => {
    let cancelled = false;
    const since = new Date();
    since.setDate(since.getDate() - days);

    listAnalyticsEvents(supabase, quiz.id, since.toISOString()).then((events) => {
      if (cancelled) return;
      const buckets = new Map<string, DayPoint>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { date: key, views: 0, starts: 0, completions: 0 });
      }
      for (const e of events) {
        const key = e.created_at.slice(0, 10);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        if (e.event_type === "view") bucket.views += 1;
        else if (e.event_type === "start") bucket.starts += 1;
        else if (e.event_type === "complete") bucket.completions += 1;
      }
      setData(Array.from(buckets.values()));
    });

    return () => {
      cancelled = true;
    };
  }, [supabase, quiz.id, days]);

  useEffect(() => {
    let cancelled = false;
    getQuestionDropoff(supabase, quiz.id, steps.length).then((d) => {
      if (!cancelled) setDropoff(d);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, quiz.id, steps.length]);

  const totals = data.reduce(
    (acc, p) => ({ views: acc.views + p.views, starts: acc.starts + p.starts, completions: acc.completions + p.completions }),
    { views: 0, starts: 0, completions: 0 }
  );
  const completionRate = totals.starts ? Math.round((totals.completions / totals.starts) * 100) : 0;
  const conversionRate = totals.views ? Math.round((totals.completions / totals.views) * 100) : 0;

  const dropoffChartData = useMemo(() => {
    if (!dropoff) return [];
    return steps.map((node, i) => {
      const reached = dropoff.reachedByStep[i] ?? 0;
      const nextReached = i + 1 < steps.length ? dropoff.reachedByStep[i + 1] ?? 0 : dropoff.completedSessions;
      const dropped = Math.max(0, reached - nextReached);
      const dropRate = reached ? Math.round((dropped / reached) * 100) : 0;
      return { label: `${i + 1}. ${stepLabel(node)}`, reached, dropped, dropRate };
    });
  }, [dropoff, steps]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">אנליטיקה</h2>
        <Select
          value={range}
          onValueChange={(v) => v && setRange(v)}
          items={Object.fromEntries(RANGE_OPTIONS.map((r) => [r.value, r.label]))}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "צפיות", value: totals.views },
          { label: "התחילו", value: totals.starts },
          { label: "סיימו", value: totals.completions },
          { label: "שיעור השלמה", value: `${completionRate}%` },
          { label: "Conversion", value: `${conversionRate}%` },
        ].map((k) => (
          <Card key={k.label}><CardContent className="py-1"><p className="text-xs text-muted-foreground">{k.label}</p><p className="text-lg font-bold mt-1">{k.value}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">ביצועים לאורך זמן</CardTitle></CardHeader>
        <CardContent>
          {totals.views === 0 && totals.starts === 0 && totals.completions === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              עדיין אין נתוני תנועה לשאלון הזה. הנתונים ייאספו אוטומטית מרגע שמישהו יפתח את הקישור הציבורי.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" width={30} allowDecimals={false} />
                <Tooltip contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="views" fill="var(--color-chart-2)" radius={4} name="צפיות" />
                <Bar dataKey="starts" fill="var(--color-chart-3)" radius={4} name="התחלות" />
                <Bar dataKey="completions" fill="var(--color-chart-1)" radius={4} name="השלמות" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">נטישה לפי שאלה</CardTitle></CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">אין שאלות בשאלון הזה עדיין.</p>
          ) : !dropoff || dropoff.totalSessions === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              עדיין אין מספיק נתוני מבקרים כדי להציג נטישה לפי שאלה.
            </p>
          ) : (
            <div dir="ltr">
              <ResponsiveContainer width="100%" height={Math.max(220, steps.length * 46)}>
                <BarChart data={dropoffChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid horizontal={false} stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={220}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 8 }}
                    formatter={(value, name, entry) => {
                      if (name === "reached") return [value ?? 0, "הגיעו לשאלה"];
                      const rate = (entry?.payload as { dropRate: number } | undefined)?.dropRate ?? 0;
                      return [`${value ?? 0} (${rate}%)`, "נטשו כאן"];
                    }}
                  />
                  <Bar dataKey="reached" fill="var(--color-chart-2)" radius={4} name="reached" />
                  <Bar dataKey="dropped" fill="var(--color-destructive)" radius={4} name="dropped" />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-xs text-muted-foreground">
                מבוסס על {dropoff.totalSessions} מבקרים שהתחילו את השאלון (לא כולל סשנים לדוגמה). &quot;נטשו כאן&quot; = מי שהגיע לשאלה אך לא המשיך לשאלה הבאה (או לא סיים, אם זו השאלה האחרונה).
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
