"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { updateQuizTheme } from "@/lib/supabase/queries";
import { Quiz, QuizTheme } from "@/lib/types";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { SunAvatar } from "@/components/runtime/sun-avatar";

// Mirrors quiz-runner.tsx's buildPalette() — keep the fallback colors in sync
// if that function's defaults ever change.
function buildPreviewPalette(theme: QuizTheme) {
  const accent = theme.primaryColor || "#EE746C";
  return {
    page: theme.backgroundColor || "#F7F6EC",
    bubbleBot: "#FFFFFF",
    bubbleUser: "#F1EFF2",
    buttonBorder: accent,
    buttonText: accent,
    text: theme.textColor || "#535C82",
    muted: theme.mutedTextColor || "#9AA0BE",
  };
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const swatchValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="color" value={swatchValue} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 shrink-0 p-1" />
        <Input
          dir="ltr"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v && !v.startsWith("#") ? `#${v}` : v);
          }}
          placeholder="#F3F3E8"
          maxLength={7}
          className="h-9 flex-1 font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}

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

  const palette = buildPreviewPalette(theme);
  const previewBg = theme.backgroundImageUrl ? `url(${theme.backgroundImageUrl}) center/cover` : palette.page;

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
          <CardHeader><CardTitle className="text-base">אווטאר לצד כל שאלה</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              מוצג לצד כל הודעה/שאלה מהבוט בשאלון החי, במקום האייקון המוגדר כברירת מחדל (אופציונלי).
            </p>
            <ImageUploadField
              value={theme.avatarUrl ?? ""}
              onChange={(url) => patch({ avatarUrl: url })}
              previewClassName="h-16 w-16 rounded-full object-cover mx-auto bg-white p-1"
              uploadLabel="העלה תמונת אווטאר"
              replaceLabel="החלף אווטאר"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">צבעים</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ColorField label="צבע ראשי (כפתורים)" value={theme.primaryColor} onChange={(v) => patch({ primaryColor: v })} />
              <ColorField label="רקע הצ'אט" value={theme.backgroundColor} onChange={(v) => patch({ backgroundColor: v })} />
              <ColorField label="צבע הטקסט" value={theme.textColor} onChange={(v) => patch({ textColor: v })} />
              <ColorField
                label="צבע טקסט עזרה"
                value={theme.mutedTextColor ?? "#9AA0BE"}
                onChange={(v) => patch({ mutedTextColor: v })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              &quot;צבע ראשי&quot; משמש גם לבועת ההטמעה הצפה (בטאב &quot;שיתוף&quot;) וגם לכפתורי המענה בצ&apos;אט עצמו.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">תמונת רקע</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">אופציונלי. אם לא מועלית תמונה, ישמש &quot;רקע הצ&apos;אט&quot; שהוגדר למעלה.</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">רקע לדסקטופ</Label>
              <ImageUploadField
                value={theme.backgroundImageUrl ?? ""}
                onChange={(url) => patch({ backgroundImageUrl: url })}
                previewClassName="h-24 w-full object-cover"
                uploadLabel="העלה רקע דסקטופ"
                replaceLabel="החלף רקע דסקטופ"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">רקע למובייל</Label>
              <ImageUploadField
                value={theme.backgroundImageUrlMobile ?? ""}
                onChange={(url) => patch({ backgroundImageUrlMobile: url })}
                previewClassName="h-24 w-full object-cover"
                uploadLabel="העלה רקע מובייל"
                replaceLabel="החלף רקע מובייל"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 h-fit">
        <p className="text-xs text-muted-foreground mb-2">כך נראה השאלון החי</p>
        <div dir="rtl" className="rounded-2xl border overflow-hidden aspect-[9/16] overflow-y-auto" style={{ background: previewBg }}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-center rounded-[20px] bg-white py-5 shadow-sm">
              {theme.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={theme.logoUrl} alt="" className="h-10 object-contain" />
              ) : (
                <p className="text-base font-bold" style={{ color: palette.text }}>{quiz.name}</p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="flex items-end gap-2">
                <div
                  className="max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-relaxed"
                  style={{ background: palette.bubbleBot, color: palette.text }}
                >
                  <p className="font-bold">מהו גילך?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["עד 30", "31–45", "46–60"].map((label) => (
                      <span
                        key={label}
                        className="rounded-lg border-2 bg-white px-3 py-1.5 text-xs font-semibold"
                        style={{ borderColor: palette.buttonBorder, color: palette.buttonText }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                {theme.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={theme.avatarUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <SunAvatar size={28} />
                )}
              </div>
            </div>

            <div className="flex flex-col items-start gap-1">
              <div
                className="max-w-[75%] rounded-[20px] px-4 py-2.5 text-sm leading-relaxed"
                style={{ background: palette.bubbleUser, color: palette.text }}
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
