"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeadStatusBadge, CategoryBadge } from "@/components/shared/status-badges";
import { LeadDrawer } from "@/components/leads/lead-drawer";
import { createClient } from "@/lib/supabase/client";
import { deleteLead, listLeads } from "@/lib/supabase/queries";
import { useWorkspaceId } from "@/components/layout/workspace-provider";
import { LEAD_STATUS_LABELS, Lead, LeadStatus } from "@/lib/types";

function exportCsv(leads: Lead[]) {
  const header = ["שם", "טלפון", "אימייל", "שאלון", "ציון", "סטטוס", "מקור", "שם המודעה", "תאריך"];
  const rows = leads.map((l) => [
    l.name,
    l.phone,
    l.email,
    l.quizName,
    String(l.score),
    LEAD_STATUS_LABELS[l.status],
    l.utmSource ?? "",
    l.utmContent ?? "",
    new Date(l.createdAt).toLocaleDateString("he-IL"),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  const supabase = useMemo(() => createClient(), []);
  const workspaceId = useWorkspaceId();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [selected, setSelected] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const data = await listLeads(supabase, workspaceId);
    setLeads(data);
    setLoading(false);
  }, [supabase, workspaceId]);

  async function handleDelete(lead: Lead) {
    if (!window.confirm(`למחוק את הליד "${lead.name}"? הפעולה בלתי הפיכה.`)) return;
    setLeads((ls) => ls.filter((l) => l.id !== lead.id));
    if (selected?.id === lead.id) setSelected(null);
    await deleteLead(supabase, lead.id);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchesQuery =
        l.name.toLowerCase().includes(query.toLowerCase()) ||
        l.phone.includes(query) ||
        l.email.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [leads, query, statusFilter]);

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
        <h1 className="text-2xl font-bold tracking-tight">לידים</h1>
        <Button variant="outline" onClick={() => exportCsv(filtered)}>
          <Download className="size-4" /> ייצוא CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי שם, טלפון או אימייל..." value={query} onChange={(e) => setQuery(e.target.value)} className="pe-9" />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}
          items={{ all: "כל הסטטוסים", ...LEAD_STATUS_LABELS }}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>טלפון</TableHead>
                <TableHead>שאלון מקור</TableHead>
                <TableHead>ציון</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>מקור UTM</TableHead>
                <TableHead>שם המודעה</TableHead>
                <TableHead>תאריך מילוי</TableHead>
                <TableHead>נציג</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => setSelected(lead)}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell dir="ltr" className="text-end">{lead.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.quizName}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {lead.score} <CategoryBadge category={lead.category} />
                    </span>
                  </TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{lead.utmSource}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{lead.utmContent ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(lead.createdAt).toLocaleDateString("he-IL")}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{lead.assignedTo ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(lead);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">
              {leads.length === 0 ? "עדיין אין לידים" : "לא נמצאו לידים תואמים"}
            </div>
          )}
        </CardContent>
      </Card>

      <LeadDrawer lead={selected} onOpenChange={(open) => !open && setSelected(null)} onUpdated={load} />
    </div>
  );
}
