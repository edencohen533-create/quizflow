"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Plus, Pencil, Copy, Trash2, Target, Webhook as WebhookIcon, Music2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WebhookDialog } from "@/components/integrations/webhook-dialog";
import { createClient } from "@/lib/supabase/client";
import {
  addIntegration,
  deleteIntegration,
  listIntegrationsForQuiz,
  updateIntegration,
} from "@/lib/supabase/queries";
import { testWebhook } from "@/lib/integrations";
import {
  createTrackingEvent,
  deleteTrackingEvent,
  duplicateTrackingEvent,
  getTrackingSettings,
  listTrackingActivity,
  listTrackingEvents,
  logTrackingActivity,
  seedDefaultTrackingEvents,
  updateTrackingEvent,
  updateTrackingSettings,
  TrackingEventInput,
} from "@/lib/supabase/tracking-queries";
import { Integration, Quiz, QuizTrackingActivity, QuizTrackingEvent, QuizTrackingSettings, TRACKING_EVENT_LABELS } from "@/lib/types";
import { TrackingEventDialog } from "@/components/editor/tracking-event-dialog";
import { toast } from "sonner";

const GTM_REGEX = /^GTM-[A-Z0-9]+$/i;
const PIXEL_ID_REGEX = /^\d+$/;

function TRIGGER_LABEL(nodeId: string | null, quiz: Quiz) {
  if (nodeId === null) return "בטעינת השאלון";
  if (nodeId === "__lead_details__") return "לאחר השארת פרטים";
  if (nodeId === "__end__") return "במסך הסיום";
  const node = quiz.nodes.find((n) => n.id === nodeId);
  if (node?.data.kind === "question") return node.data.title;
  return nodeId;
}

function timeAgo(iso?: string) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "לפני רגע";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return new Date(iso).toLocaleDateString("he-IL");
}

function WebhookRow({ integration, onChanged, onEdit }: { integration: Integration; onChanged: () => void; onEdit: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    const result = await testWebhook(supabase, integration);
    setTesting(false);
    if (result.ok) toast.success("הבדיקה הצליחה — ה-webhook קיבל את הבקשה");
    else toast.error(`הבדיקה נכשלה: ${result.error ?? "שגיאה לא ידועה"}`);
    onChanged();
  }

  async function handleToggle(checked: boolean) {
    await updateIntegration(supabase, integration.id, { enabled: checked });
    onChanged();
  }

  async function handleDelete() {
    await deleteIntegration(supabase, integration.id);
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shrink-0">
        <WebhookIcon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{integration.name}</p>
        <p className="text-xs text-muted-foreground truncate" dir="ltr">{integration.url}</p>
        {integration.lastTriggeredAt && (
          <p className="text-xs mt-0.5 flex items-center gap-1">
            {integration.lastStatus === "success" ? (
              <CheckCircle2 className="size-3 text-primary" />
            ) : (
              <XCircle className="size-3 text-destructive" />
            )}
            <span className="text-muted-foreground">
              {integration.lastStatus === "success" ? "נשלח בהצלחה" : `שגיאה: ${integration.lastError}`} · {timeAgo(integration.lastTriggeredAt)}
            </span>
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
        {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
        שלח בדיקה
      </Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Switch checked={integration.enabled} onCheckedChange={handleToggle} />
      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={handleDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function TikTokPixelCard({
  existing,
  workspaceId,
  quizId,
  onChanged,
}: {
  existing?: Integration;
  workspaceId: string;
  quizId: string;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState(existing?.pixelId ?? "");

  async function handleSave() {
    if (!value.trim()) return;
    if (existing) await updateIntegration(supabase, existing.id, { pixelId: value.trim(), enabled: true });
    else await addIntegration(supabase, workspaceId, quizId, { kind: "tiktok_pixel", name: "TikTok Pixel", pixelId: value.trim() });
    toast.success("TikTok Pixel נשמר ופעיל");
    onChanged();
  }

  async function handleToggle(checked: boolean) {
    if (!existing) return;
    await updateIntegration(supabase, existing.id, { enabled: checked });
    onChanged();
  }

  async function handleDelete() {
    if (!existing) return;
    await deleteIntegration(supabase, existing.id);
    onChanged();
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shrink-0">
          <Music2 className="size-4.5" />
        </span>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">TikTok Pixel</p>
            {existing && (
              <div className="flex items-center gap-2">
                <Switch checked={existing.enabled} onCheckedChange={handleToggle} />
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={handleDelete}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            שולח אירוע &quot;ליד&quot; אוטומטית לפיקסל בכל שליחת השאלון הזה, ישירות מדפדפן המשתמש.
          </p>
          <div className="flex gap-2">
            <Input dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Pixel Code, לדוגמה CXXXXXXXXXXXXXXXXX" className="h-8 text-xs" />
            <Button size="sm" onClick={handleSave} disabled={!value.trim()}>שמור</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TrackingTab({ quiz }: { quiz: Quiz }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<QuizTrackingSettings | null>(null);
  const [events, setEvents] = useState<QuizTrackingEvent[]>([]);
  const [activity, setActivity] = useState<QuizTrackingActivity[]>([]);

  const [pixelId, setPixelId] = useState("");
  const [gtmId, setGtmId] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<QuizTrackingEvent | undefined>(undefined);
  const seedingRef = useRef(false);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Integration | undefined>(undefined);

  const load = useCallback(async () => {
    const [s, e, a, i] = await Promise.all([
      getTrackingSettings(supabase, quiz.id),
      listTrackingEvents(supabase, quiz.id),
      listTrackingActivity(supabase, quiz.id),
      listIntegrationsForQuiz(supabase, quiz.id),
    ]);
    setSettings(s);
    setPixelId(s.metaPixelId ?? "");
    setGtmId(s.gtmContainerId ?? "");
    if (e.length === 0 && !seedingRef.current) {
      seedingRef.current = true;
      await seedDefaultTrackingEvents(supabase, quiz.id);
      setEvents(await listTrackingEvents(supabase, quiz.id));
    } else {
      setEvents(e);
    }
    setActivity(a);
    setIntegrations(i);
    setLoading(false);
  }, [supabase, quiz.id]);

  async function reloadIntegrations() {
    setIntegrations(await listIntegrationsForQuiz(supabase, quiz.id));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch on mount
    load();
  }, [load]);

  async function handleSavePixelId() {
    if (pixelId && !PIXEL_ID_REGEX.test(pixelId)) {
      toast.error("Pixel ID חייב להכיל ספרות בלבד");
      return;
    }
    await updateTrackingSettings(supabase, quiz.id, { metaPixelId: pixelId || null });
    await logTrackingActivity(supabase, quiz.id, `עודכן Meta Pixel ID`);
    setSavedLabel("נשמר");
    setActivity(await listTrackingActivity(supabase, quiz.id));
  }

  async function handleSaveGtm() {
    if (gtmId && !GTM_REGEX.test(gtmId)) {
      toast.error("פורמט לא תקין. דוגמה: GTM-XXXXXXX");
      return;
    }
    await updateTrackingSettings(supabase, quiz.id, { gtmContainerId: gtmId || null });
    await logTrackingActivity(supabase, quiz.id, `עודכן GTM Container ID`);
    setSavedLabel("נשמר");
    setActivity(await listTrackingActivity(supabase, quiz.id));
  }

  async function handleSaveToken() {
    if (!token.trim()) return;
    setSavingToken(true);
    const res = await fetch("/api/tracking/save-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id, token: token.trim() }),
    });
    const data = await res.json();
    setSavingToken(false);
    if (data.ok) {
      toast.success("הטוקן נשמר בהצלחה");
      setToken("");
      setShowToken(false);
      await logTrackingActivity(supabase, quiz.id, "עודכן Meta Access Token");
      setActivity(await listTrackingActivity(supabase, quiz.id));
      setSettings(await getTrackingSettings(supabase, quiz.id));
    } else {
      toast.error(data.error || "שמירת הטוקן נכשלה");
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    const res = await fetch("/api/tracking/test-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id }),
    });
    const data = await res.json();
    setTesting(false);
    if (data.ok) toast.success("החיבור תקין");
    else toast.error(`הבדיקה נכשלה: ${data.error}`);
    setSettings(await getTrackingSettings(supabase, quiz.id));
  }

  async function handleSaveEvent(input: TrackingEventInput) {
    if (editingEvent) {
      await updateTrackingEvent(supabase, editingEvent.id, input);
      await logTrackingActivity(supabase, quiz.id, `עודכן אירוע ${TRACKING_EVENT_LABELS[input.name]}`);
    } else {
      await createTrackingEvent(supabase, quiz.id, input);
      await logTrackingActivity(supabase, quiz.id, `נוסף אירוע ${TRACKING_EVENT_LABELS[input.name]}`);
    }
    setEvents(await listTrackingEvents(supabase, quiz.id));
    setActivity(await listTrackingActivity(supabase, quiz.id));
  }

  async function handleDuplicate(event: QuizTrackingEvent) {
    await duplicateTrackingEvent(supabase, quiz.id, event);
    setEvents(await listTrackingEvents(supabase, quiz.id));
  }

  async function handleDelete(event: QuizTrackingEvent) {
    await deleteTrackingEvent(supabase, event.id);
    await logTrackingActivity(supabase, quiz.id, `נמחק אירוע ${TRACKING_EVENT_LABELS[event.name]}`);
    setEvents(await listTrackingEvents(supabase, quiz.id));
    setActivity(await listTrackingActivity(supabase, quiz.id));
  }

  async function handleToggleEvent(event: QuizTrackingEvent, enabled: boolean) {
    await updateTrackingEvent(supabase, event.id, { enabled });
    setEvents((es) => es.map((e) => (e.id === event.id ? { ...e, enabled } : e)));
  }

  if (loading || !settings) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><Target className="size-4 text-emerald-600" /> מטה פיקסל ו-GTM</h2>
        {savedLabel && <span className="text-xs text-muted-foreground">{savedLabel}</span>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Meta Pixel + Conversions API</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Meta Pixel ID</Label>
            <Input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              onBlur={handleSavePixelId}
              placeholder="123456789012345"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pixel Access Token (Conversions API)</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={settings.metaHasToken ? "•••••••••••••••••••• (נשמר)" : "הדבק טוקן"}
                dir="ltr"
              />
              <Button variant="outline" size="icon" onClick={() => setShowToken((s) => !s)}>
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button onClick={handleSaveToken} disabled={!token.trim() || savingToken}>
                {savingToken && <Loader2 className="size-4 animate-spin" />}
                שמור
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">הטוקן נשמר בצד השרת בלבד ולא נשלח בחזרה לדפדפן לאחר השמירה.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
              {testing && <Loader2 className="size-3.5 animate-spin" />}
              בדוק את החיבור ל-Meta
            </Button>
            {settings.metaLastTestStatus === "success" && (
              <span className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="size-3.5" /> החיבור תקין</span>
            )}
            {settings.metaLastTestStatus === "error" && (
              <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="size-3.5" /> {settings.metaLastTestError}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            הבדיקה כוללת שליחת אירוע בדיקה ל-Meta Events Manager. היא בודקת את הטוקן השמור, אך אינה מחליפה בדיקה של אירועים חיים.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Google Tag Manager</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">GTM Container ID</Label>
          <Input value={gtmId} onChange={(e) => setGtmId(e.target.value)} onBlur={handleSaveGtm} placeholder="GTM-XXXXXXX" dir="ltr" />
          <p className="text-xs text-muted-foreground">הקונטיינר ייטען בכל עמודי השאלון שפורסמו.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Webhooks (כולל Zapier, CRM, Make, Slack)</CardTitle>
          </div>
          <Button size="sm" onClick={() => { setEditingWebhook(undefined); setWebhookDialogOpen(true); }}>
            <Plus className="size-4" /> Webhook חדש
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {integrations.filter((i) => i.kind === "webhook").length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              עדיין לא הוגדרו webhooks. לחץ על &quot;Webhook חדש&quot; כדי להתחיל.
            </p>
          ) : (
            integrations.filter((i) => i.kind === "webhook").map((w) => (
              <WebhookRow
                key={w.id}
                integration={w}
                onChanged={reloadIntegrations}
                onEdit={() => { setEditingWebhook(w); setWebhookDialogOpen(true); }}
              />
            ))
          )}
        </CardContent>
      </Card>

      <TikTokPixelCard
        existing={integrations.find((i) => i.kind === "tiktok_pixel")}
        workspaceId={quiz.workspaceId}
        quizId={quiz.id}
        onChanged={reloadIntegrations}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">אירועי המרה לפי צעד</CardTitle>
          <Button size="sm" onClick={() => { setEditingEvent(undefined); setDialogOpen(true); }}>
            <Plus className="size-4" /> הוסף אירוע
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">לא הוגדרו אירועים — לחץ &quot;הוסף אירוע&quot;</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{ev.name === "Custom" ? ev.customName : TRACKING_EVENT_LABELS[ev.name]}</p>
                    <span className="text-xs text-muted-foreground">· {TRIGGER_LABEL(ev.triggerNodeId, quiz)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    {ev.sendToPixel && <span className="rounded-full bg-muted px-2 py-0.5">Pixel</span>}
                    {ev.sendToCapi && <span className="rounded-full bg-muted px-2 py-0.5">CAPI</span>}
                    {ev.sendToGtm && <span className="rounded-full bg-muted px-2 py-0.5">GTM</span>}
                    {ev.condition && <span className="rounded-full bg-muted px-2 py-0.5">תנאי: {ev.condition.field}={ev.condition.value}</span>}
                    {ev.value != null && <span className="rounded-full bg-muted px-2 py-0.5">{ev.value} {ev.currency}</span>}
                    <span className="rounded-full bg-muted px-2 py-0.5" dir="ltr">event_id: {ev.id.slice(0, 8)}</span>
                  </div>
                </div>
                <Switch checked={ev.enabled} onCheckedChange={(v) => handleToggleEvent(ev, v)} />
                <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingEvent(ev); setDialogOpen(true); }}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleDuplicate(ev)}>
                  <Copy className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => handleDelete(ev)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {activity.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">יומן פעילות</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{a.message}</span>
                <span>{new Date(a.createdAt).toLocaleString("he-IL")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <TrackingEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        nodes={quiz.nodes}
        initial={editingEvent}
        onSave={handleSaveEvent}
      />

      <WebhookDialog
        key={editingWebhook?.id ?? "new"}
        open={webhookDialogOpen}
        onOpenChange={setWebhookDialogOpen}
        workspaceId={quiz.workspaceId}
        quizId={quiz.id}
        existing={editingWebhook}
        onCreated={reloadIntegrations}
      />
    </div>
  );
}
