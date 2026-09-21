"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { createQuiz } from "@/lib/supabase/queries";
import { Loader2 } from "lucide-react";

export function CreateQuizDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const supabase = createClient();
    const quiz = await createQuiz(supabase, workspaceId, { name: name.trim() });
    setSaving(false);
    onOpenChange(false);
    setName("");
    onCreated?.();
    router.push(`/quizzes/${quiz.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>שאלון חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="quiz-name">שם השאלון</Label>
          <Input
            id="quiz-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="לדוגמה: בדיקת התאמה לייעוץ"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            צור שאלון
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
