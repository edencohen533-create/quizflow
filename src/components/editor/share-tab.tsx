"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Quiz } from "@/lib/types";
import { toast } from "sonner";

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="rounded-lg border bg-muted/50 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all" dir="ltr">
        {value}
      </pre>
      <Button
        size="icon"
        variant="secondary"
        className="absolute top-2 left-2 size-7"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("הועתק ללוח");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function ShareTab({ quiz }: { quiz: Quiz }) {
  const [trigger, setTrigger] = useState<"button" | "delay" | "exit">("button");
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [advanced, setAdvanced] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${origin}/q/${quiz.slug}`;
  const fullPageCode = `<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${quiz.name}</title>
  </head>
  <body>
    <script src="${origin}/embed.js"></script>
    <script>
      QuizFlow.init({
        quiz: "${quiz.slug}",
        trigger: "fullpage"
      });
    </script>
  </body>
</html>`;

  const quickPopupCode = `<script src="${origin}/embed.js" data-quiz="${quiz.slug}" data-trigger="${trigger}"${
    trigger === "delay" ? ` data-delay="${delaySeconds}"` : ""
  }></script>`;

  const advancedPopupCode = `<script src="${origin}/embed.js"></script>
<script>
  QuizFlow.init({
    quiz: "${quiz.slug}",
    trigger: "${trigger}"${trigger === "delay" ? `,\n    delay: ${delaySeconds}` : ""},
    color: "${quiz.theme.primaryColor}"
  });
</script>`;

  const inlineCode = `<div id="quizflow-container"></div>
<script src="${origin}/embed.js"></script>
<script>
  QuizFlow.init({
    quiz: "${quiz.slug}",
    trigger: "inline",
    container: "#quizflow-container"
  });
</script>`;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Card>
        <CardHeader><CardTitle className="text-base">קישור ציבורי</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <CopyBlock value={publicUrl} />
          <p className="text-xs text-muted-foreground">כל מי שיש לו את הקישור יוכל למלא את השאלון.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">הטמעה מלאה בעמוד</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            עמוד HTML עצמאי שממלא את כל המסך בשאלון (למשל כדף נחיתה בפני עצמו).
          </p>
          <CopyBlock value={fullPageCode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">הטמעה מוטבעת בתוך העמוד</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            מציג את השאלון בתוך אזור קבוע בעמוד (למשל בתוך סקשן בדף נחיתה), בלי חלון קופץ.
          </p>
          <CopyBlock value={inlineCode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ווידג&apos;ט צף / פופאפ</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            מוסיף בועת צ&apos;אט צפה (או פותח על כפתור קיים באתר) שמציגה את השאלון בחלון קופץ.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 w-48">
              <Label className="text-xs">Trigger להצגת הפופאפ</Label>
              <Select
                value={trigger}
                onValueChange={(v) => v && setTrigger(v as typeof trigger)}
                items={{ button: "בלחיצה על כפתור", delay: "לאחר X שניות", exit: "ביציאה מהעמוד" }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="button">בלחיצה על כפתור</SelectItem>
                  <SelectItem value="delay">לאחר X שניות</SelectItem>
                  <SelectItem value="exit">ביציאה מהעמוד</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {trigger === "delay" && (
              <div className="space-y-1.5 w-24">
                <Label className="text-xs">שניות</Label>
                <Input
                  type="number"
                  min={1}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value) || 1)}
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mb-0.5"
              onClick={() => setAdvanced((a) => !a)}
            >
              {advanced ? "הצג קוד פשוט" : "הצג קוד מתקדם"}
            </Button>
          </div>
          <CopyBlock value={advanced ? advancedPopupCode : quickPopupCode} />
          {trigger === "button" && (
            <p className="text-xs text-muted-foreground">
              בברירת מחדל תופיע בועה צפה בפינת המסך. כדי לחבר לכפתור קיים באתר שלך, הוסף לתגית הסקריפט <code dir="ltr">data-button-selector=&quot;#my-button&quot;</code> (או <code dir="ltr">buttonSelector</code> בקוד המתקדם).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
