"use client";

import { useState } from "react";
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
import { addIntegration } from "@/lib/supabase/queries";

export function WebhookDialog({
  open,
  onOpenChange,
  workspaceId,
  quizId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  quizId: string;
  onCreated?: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");

  function reset() {
    setName("");
    setUrl("");
    setSecret("");
  }

  async function handleCreate() {
    if (!name.trim() || !url.trim()) return;
    const supabase = createClient();
    await addIntegration(supabase, workspaceId, quizId, { kind: "webhook", name: name.trim(), url: url.trim(), secret: secret.trim() || undefined });
    onOpenChange(false);
    reset();
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Webhook חדש</DialogTitle>
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || !url.trim()}>הוסף</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
