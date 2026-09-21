"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { addIntegration, updateIntegration } from "@/lib/supabase/queries";
import { Integration } from "@/lib/types";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

type ParamRow = { id: string; key: string; value: string };

export function WebhookDialog({
  open,
  onOpenChange,
  workspaceId,
  quizId,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  quizId: string;
  existing?: Integration;
  onCreated?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [secret, setSecret] = useState(existing?.secret ?? "");
  const [params, setParams] = useState<ParamRow[]>((existing?.extraParams ?? []).map((p) => ({ id: uid(), ...p })));

  function addParam() {
    setParams((ps) => [...ps, { id: uid(), key: "", value: "" }]);
  }
  function updateParam(id: string, patch: Partial<ParamRow>) {
    setParams((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removeParam(id: string) {
    setParams((ps) => ps.filter((p) => p.id !== id));
  }

  async function handleSave() {
    if (!name.trim() || !url.trim()) return;
    const supabase = createClient();
    const extraParams = params
      .map((p) => ({ key: p.key.trim(), value: p.value }))
      .filter((p) => p.key);
    if (existing) {
      await updateIntegration(supabase, existing.id, {
        name: name.trim(),
        url: url.trim(),
        secret: secret.trim() || undefined,
        extraParams,
      });
    } else {
      await addIntegration(supabase, workspaceId, quizId, {
        kind: "webhook",
        name: name.trim(),
        url: url.trim(),
        secret: secret.trim() || undefined,
        extraParams,
      });
    }
    onOpenChange(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "עריכת Webhook" : "Webhook חדש"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">שם (למשל: CRM ראשי, Zapier, Slack)</Label>
            <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="שם לזיהוי" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">כתובת Webhook</Label>
            <Input id="wh-url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/..." />
            <p className="text-xs text-muted-foreground">
              עובד עם כל כתובת שמקבלת POST: Zapier (Catch Hook), Make, Slack, n8n, או ה-CRM שלך.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-secret">מפתח סודי לאימות (אופציונלי)</Label>
            <Input id="wh-secret" dir="ltr" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="נשלח בכותרת X-QuizFlow-Secret" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">פרמטרים נוספים לשליחה (אופציונלי)</Label>
            <div className="space-y-1.5">
              {params.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <Input
                    dir="ltr"
                    value={p.key}
                    onChange={(e) => updateParam(p.id, { key: e.target.value })}
                    placeholder="key"
                    className="h-8 text-xs"
                  />
                  <Input
                    dir="ltr"
                    value={p.value}
                    onChange={(e) => updateParam(p.id, { value: e.target.value })}
                    placeholder="value"
                    className="h-8 text-xs"
                  />
                  <Button variant="ghost" size="icon" className="size-8 shrink-0 text-destructive" onClick={() => removeParam(p.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={addParam}>
              <Plus className="size-3.5" /> הוסף פרמטר
            </Button>
            <p className="text-xs text-muted-foreground">
              נשלחים בכל בקשה תחת <code dir="ltr">params</code>, בנוסף לפרטי הליד ותשובות השאלון.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !url.trim()}>{existing ? "שמור" : "הוסף"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
