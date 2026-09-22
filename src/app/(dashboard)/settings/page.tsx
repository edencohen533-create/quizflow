"use client";
import { AccountSecurity } from "@/components/security/account-security";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { updateProfileName, updateWorkspaceName } from "@/lib/supabase/queries";
import { useWorkspaceId } from "@/components/layout/workspace-provider";
import { toast } from "sonner";

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const workspaceId = useWorkspaceId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const load = useCallback(async () => {
    // getSession() reads the already-verified JWT locally — the proxy
    // already revalidated it server-side before this page rendered, so
    // getUser() here would just be a redundant network round trip for a
    // read-only display of the current name/email.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    setEmail(user.email ?? "");
    setFullName((user.user_metadata?.full_name as string | undefined) ?? "");

    if (!workspaceId) return;
    const { data: ws } = await supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
    setWorkspaceName(ws?.name ?? "");
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch on mount
    load();
  }, [load]);

  async function handleSave() {
    if (!workspaceId) return;
    setSaving(true);
    try { await Promise.all([updateProfileName(supabase, fullName), updateWorkspaceName(supabase, workspaceId, workspaceName)]); toast.success("הפרטים נשמרו"); }
    catch { toast.error("שמירת הפרטים נכשלה"); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">פרטי חשבון</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">שם מלא</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">אימייל</Label>
            <Input value={email} dir="ltr" disabled />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">שם ה-workspace</Label>
            <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            שמור שינויים
          </Button>
        </CardContent>
      </Card>
      <AccountSecurity />
      <Card className="opacity-70">
        <CardHeader><CardTitle className="text-base">חיוב וניהול משתמשים</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          ניהול הרשאות צוות, תפקידים וחיוב חודשי יתווספו בשלב הבא של המוצר.
        </CardContent>
      </Card>
    </div>
  );
}
