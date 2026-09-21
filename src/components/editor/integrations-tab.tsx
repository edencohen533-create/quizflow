"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Webhook as WebhookIcon, Music2, Zap, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { Integration, Quiz } from "@/lib/types";

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

function WebhookRow({ integration, onChanged }: { integration: Integration; onChanged: () => void }) {
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

export function IntegrationsTab({ quiz }: { quiz: Quiz }) {
  const supabase = useMemo(() => createClient(), []);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await listIntegrationsForQuiz(supabase, quiz.id);
    setIntegrations(data);
    setLoading(false);
  }, [supabase, quiz.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch on mount
    load();
  }, [load]);

  const webhooks = integrations.filter((i) => i.kind === "webhook");
  const tiktokPixel = integrations.find((i) => i.kind === "tiktok_pixel");

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">אינטגרציות</h2>
          <p className="text-sm text-muted-foreground mt-1">
            כל אינטגרציה כאן פועלת רק על השאלון הזה — נורה בכל שליחת ליד ממנו.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> Webhook חדש
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Zap className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Webhooks (כולל Zapier, CRM, Make, Slack)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              עדיין לא הוגדרו webhooks. לחץ על &quot;Webhook חדש&quot; כדי להתחיל.
            </p>
          ) : (
            webhooks.map((w) => <WebhookRow key={w.id} integration={w} onChanged={load} />)
          )}
        </CardContent>
      </Card>

      <TikTokPixelCard existing={tiktokPixel} workspaceId={quiz.workspaceId} quizId={quiz.id} onChanged={load} />

      <p className="text-xs text-muted-foreground">
        Meta Pixel / Conversions API / GTM מוגדרים בטאב &quot;טראקינג&quot; של השאלון הזה.
      </p>

      <WebhookDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={quiz.workspaceId} quizId={quiz.id} onCreated={load} />
    </div>
  );
}
