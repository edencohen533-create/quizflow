"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "recovery";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "recovery") {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/reset-password" });
      setLoading(false);
      setCheckEmail(true);
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setCheckEmail(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-sm text-center space-y-3 rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <h1 className="font-bold text-lg">בדוק את האימייל שלך</h1>
          <p className="text-sm text-muted-foreground">
            אם הכתובת קיימת וניתן לשלוח אליה, יישלח אליה קישור להמשך הפעולה.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <h1 className="font-bold text-xl">QuizFlow</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "recovery" ? "שחזור סיסמה" : mode === "signin" ? "התחברות לחשבון שלך" : "יצירת חשבון חדש"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">שם מלא</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">אימייל</Label>
            <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode !== "recovery" && <div className="space-y-1.5">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "signup" ? 12 : 6}
              required
            />
          </div>
          }
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "recovery" ? "שלח קישור לשחזור" : mode === "signin" ? "התחבר" : "הרשמה"}
          </Button>
        </form>

        {mode === "signin" && <button type="button" className="w-full text-sm underline" onClick={() => { setMode("recovery"); setError(null); }}>שכחתי סיסמה</button>}
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
          }}
        >
          {mode === "signin" ? "אין לך חשבון? הרשמה" : "כבר יש לך חשבון? התחברות"}
        </button>
      </div>
    </div>
  );
}
