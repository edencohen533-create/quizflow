"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { updateQuizTheme } from "@/lib/supabase/queries";
import { Quiz, QuizTheme } from "@/lib/types";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { SunAvatar } from "@/components/runtime/sun-avatar";

// The live chat runtime (quiz-runner.tsx) has its own fixed look-and-feel —
// only the logo and the embed-widget color are actually customizable. Keep
// this in sync with quiz-runner.tsx's PALETTE if that ever changes.
const CHAT_PALETTE = {
  page: "#F7F6EC",
  bubbleBot: "#FFFFFF",
  bubbleUser: "#F1EFF2",
  buttonBorder: "#F5C85E",
  buttonText: "#EE746C",
  text: "#535C82",
  muted: "#9AA0BE",
};

export function DesignTab({ quiz, onThemeChange }: { quiz: Quiz; onThemeChange?: (theme: QuizTheme) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [theme, setTheme] = useState<QuizTheme>(quiz.theme);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch(next: Partial<QuizTheme>) {
    const merged = { ...theme, ...next };
    setTheme(merged);
    onThemeChange?.(merged);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateQuizTheme(supabase, quiz.id, merged);
    }, 400);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 p-6 max-w-6xl">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">לוגו</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              מוצג בראש השאלון החי. אם לא הועלה לוגו, יוצג שם השאלון בתור טקסט.
            </p>
            <ImageUploadField
              value={theme.logoUrl ?? ""}
              onChange={(url) => patch({ logoUrl: url })}
              previewClassName="h-16 w-full object-contain bg-white p-2"
              uploadLabel="העלה לוגו"
              replaceLabel="החלף לוגו"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">צבע ווידג&apos;ט הטמעה</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              צבע הבועה הצפה כשמטמיעים את השאלון כווידג&apos;ט באתר חיצוני (בטאב &quot;שיתוף&quot;, קוד מתקדם). לא משפיע על מראה הצ&apos;אט של השאלון עצמו — זה קבוע בעיצוב הנוכחי.
            </p>
            <Input type="color" value={theme.primaryColor} onChange={(e) => patch({ primaryColor: e.target.value })} className="h-9 w-24 p-1" />
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 h-fit">
        <p className="text-xs text-muted-foreground mb-2">כך נראה השאלון החי (עיצוב הצ&apos;אט קבוע)</p>
        <div dir="rtl" className="rounded-2xl border overflow-hidden aspect-[9/16] overflow-y-auto" style={{ background: CHAT_PALETTE.page }}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-center rounded-[20px] bg-white py-5 shadow-sm">
              {theme.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={theme.logoUrl} alt="" className="h-10 object-contain" />
              ) : (
                <p className="text-base font-bold" style={{ color: CHAT_PALETTE.text }}>{quiz.name}</p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="flex items-end gap-2">
                <div
                  className="max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-relaxed"
                  style={{ background: CHAT_PALETTE.bubbleBot, color: CHAT_PALETTE.text }}
                >
                  <p className="font-bold">מהו גילך?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["עד 30", "31–45", "46–60"].map((label) => (
                      <span
                        key={label}
                        className="rounded-lg border-2 bg-white px-3 py-1.5 text-xs font-semibold"
                        style={{ borderColor: CHAT_PALETTE.buttonBorder, color: CHAT_PALETTE.buttonText }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <SunAvatar size={28} />
              </div>
            </div>

            <div className="flex flex-col items-start gap-1">
              <div
                className="max-w-[75%] rounded-[20px] px-4 py-2.5 text-sm leading-relaxed"
                style={{ background: CHAT_PALETTE.bubbleUser, color: CHAT_PALETTE.text }}
              >
                31–45
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
