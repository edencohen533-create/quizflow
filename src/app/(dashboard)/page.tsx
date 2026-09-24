import Link from "next/link";
import { ListChecks, Users, Percent, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { LeadsChart } from "@/components/dashboard/leads-chart-lazy";
import { QuizStatusBadge, LeadStatusBadge } from "@/components/shared/status-badges";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId, getWorkspaceConversion, listLeadCounts, listQuizzes, listRecentLeads } from "@/lib/supabase/queries";
import { AnalyticsPoint } from "@/lib/types";

function buildLeadsPerDay(leads: { createdAt: string }[]): AnalyticsPoint[] {
  const days: AnalyticsPoint[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = leads.filter((l) => l.createdAt.slice(0, 10) === key).length;
    days.push({ date: key, views: 0, starts: 0, completions: 0, leads: count });
  }
  return days;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId(supabase);
  const [quizzes, leads, recentLeads, conversion] = await Promise.all([
    listQuizzes(supabase, workspaceId),
    listLeadCounts(supabase, workspaceId),
    listRecentLeads(supabase, workspaceId, 5),
    getWorkspaceConversion(supabase, workspaceId),
  ]);

  const activeQuizzes = quizzes.filter((q) => q.status === "active").length;
  const now = new Date();
  const leadsThisMonth = leads.filter((l) => {
    const d = new Date(l.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const conversionRate = conversion.views ? `${Math.round((conversion.leads / conversion.views) * 1000) / 10}%` : "—";

  const chartData = buildLeadsPerDay(leads);
  const recentQuizzes = quizzes.slice(0, 5);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">לוח בקרה</h1>
        <Button
          nativeButton={false}
          render={
            <Link href="/quizzes?new=1">
              <Plus className="size-4" />
              צור שאלון חדש
            </Link>
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="שאלונים פעילים" value={String(activeQuizzes)} icon={ListChecks} hint={`מתוך ${quizzes.length} סה"כ`} />
        <KpiCard label="לידים החודש" value={String(leadsThisMonth)} icon={Users} />
        <KpiCard label="אחוז המרה" value={conversionRate} icon={Percent} hint={conversion.views ? `${conversion.leads.toLocaleString("he-IL")} לידים מתוך ${conversion.views.toLocaleString("he-IL")} צפיות · כל התקופה` : "אין עדיין צפיות בשאלונים"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">לידים לפי ימים</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsChart data={chartData} />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">שאלונים אחרונים</CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/quizzes">הצג הכול</Link>} />
          </CardHeader>
          <CardContent>
            {recentQuizzes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">עדיין אין שאלונים</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>עדכון אחרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentQuizzes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">
                        <Link href={`/quizzes/${q.id}`}>{q.name}</Link>
                      </TableCell>
                      <TableCell><QuizStatusBadge status={q.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(q.updatedAt).toLocaleDateString("he-IL")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">לידים אחרונים</CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/leads">הצג הכול</Link>} />
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">עדיין אין לידים</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>שאלון</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLeads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{l.quizName}</TableCell>
                      <TableCell><LeadStatusBadge status={l.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
