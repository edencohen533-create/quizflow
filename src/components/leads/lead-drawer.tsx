"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, MessageCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadStatusBadge, CategoryBadge } from "@/components/shared/status-badges";
import { Lead, LEAD_STATUS_LABELS, LeadStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { addLeadNote as addLeadNoteQuery, updateLeadStatus as updateLeadStatusQuery } from "@/lib/supabase/queries";
import { toast } from "sonner";
import { getLeadDetails } from "@/lib/supabase/queries";
import { useWorkspaceId } from "@/components/layout/workspace-provider";

// The list mounts this loader only after a row is opened. Its key is the
// selected lead id, so an old request cannot replace a newly selected lead.
export function LeadDrawer({
  lead: summary,
  onOpenChange,
  onUpdated,
}: {
  lead: Lead;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (lead: Lead) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const workspaceId = useWorkspaceId();
  const [detail, setDetail] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getLeadDetails(supabase, workspaceId, summary.id).then((lead) => {
      if (cancelled) return;
      if (!lead) {
        setError("הליד לא נמצא");
        return;
      }
      setDetail(lead);
      setError(null);
      if (revision > 0) onUpdated?.(lead);
    }).catch(() => {
      if (!cancelled) setError("לא ניתן לטעון את פרטי הליד");
    });
    return () => { cancelled = true; };
  }, [supabase, workspaceId, summary.id, revision, onUpdated]);

  if (!detail || error) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{summary.name}</SheetTitle></SheetHeader>
          <div className="px-4 py-6" role="status">
            {error ? (
              <div className="space-y-3">
                <p>{error}</p>
                <Button variant="outline" onClick={() => { setError(null); setRevision((value) => value + 1); }}>נסה שוב</Button>
              </div>
            ) : <Loader2 className="size-5 animate-spin" aria-label="טוען פרטי ליד" />}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return <LeadDrawerContent lead={detail} onOpenChange={onOpenChange} onUpdated={() => setRevision((value) => value + 1)} />;
}

function LeadDrawerContent({
  lead,
  onOpenChange,
  onUpdated,
}: {
  lead: Lead | null;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const [note, setNote] = useState("");

  async function handleStatusChange(status: LeadStatus) {
    if (!lead) return;
    const supabase = createClient();
    await updateLeadStatusQuery(supabase, lead.id, status);
    onUpdated?.();
  }

  async function handleAddNote() {
    if (!lead || !note.trim()) return;
    const supabase = createClient();
    await addLeadNoteQuery(supabase, lead.id, note.trim());
    setNote("");
    onUpdated?.();
  }

  if (!lead) return null;

  return (
    <Sheet open={!!lead} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {lead.name}
            <CategoryBadge category={lead.category} />
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(lead.phone);
                toast.success("הטלפון הועתק");
              }}
            >
              <Copy className="size-3.5" /> {lead.phone}
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={`https://wa.me/972${lead.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              }
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">סטטוס</p>
            <Select
              value={lead.status}
              onValueChange={(v) => v && handleStatusChange(v as LeadStatus)}
              items={LEAD_STATUS_LABELS}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">אימייל</p><p className="truncate">{lead.email}</p></div>
            <div><p className="text-xs text-muted-foreground">ציון</p><p>{lead.score}</p></div>
            <div><p className="text-xs text-muted-foreground">שאלון מקור</p><p className="truncate">{lead.quizName}</p></div>
            <div><p className="text-xs text-muted-foreground">תאריך מילוי</p><p>{new Date(lead.createdAt).toLocaleString("he-IL")}</p></div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">נתוני UTM</p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {lead.utmSource && <span className="rounded-full bg-muted px-2 py-1">source: {lead.utmSource}</span>}
              {lead.utmMedium && <span className="rounded-full bg-muted px-2 py-1">medium: {lead.utmMedium}</span>}
              {lead.utmCampaign && <span className="rounded-full bg-muted px-2 py-1">campaign: {lead.utmCampaign}</span>}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">תשובות</p>
            <div className="space-y-2">
              {lead.answers.map((a, i) => (
                <div key={i} className="rounded-lg border p-2.5 text-sm">
                  <p className="text-xs text-muted-foreground">{a.questionTitle}</p>
                  <p className="font-medium">{a.answerLabel}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">היסטוריית סטטוס</p>
            <div className="space-y-1.5">
              {lead.statusHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <LeadStatusBadge status={h.status} />
                  <span className="text-muted-foreground">{new Date(h.at).toLocaleString("he-IL")}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">הערות פנימיות</p>
            {lead.notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-muted/60 p-2 text-sm">{n.text}</div>
            ))}
            <div className="flex gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="הוסף הערה..." />
            </div>
            <Button size="sm" variant="outline" disabled={!note.trim()} onClick={handleAddNote}>
              הוסף הערה
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
