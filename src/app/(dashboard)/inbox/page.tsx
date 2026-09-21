"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspaceId } from "@/components/layout/workspace-provider";
import {
  applySessionChange,
  deleteDemoSessions,
  deleteSession,
  getDemoLiveEnabled,
  listLiveSessions,
  setDemoLiveEnabled,
  subscribeToSessions,
} from "@/lib/supabase/live-sessions-queries";
import { startDemoSimulator } from "@/lib/live-session-demo";
import { QuizSession } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { SessionList } from "@/components/live-sessions/session-list";
import { SessionThread } from "@/components/live-sessions/session-thread";
import { SessionDetails } from "@/components/live-sessions/session-details";

export default function InboxPage() {
  const supabase = useMemo(() => createClient(), []);
  const workspaceId = useWorkspaceId();
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demoLive, setDemoLive] = useState(false);
  const stopSimulatorRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      const [list, demo] = await Promise.all([listLiveSessions(supabase, workspaceId), getDemoLiveEnabled(supabase, workspaceId)]);
      setSessions(list);
      setDemoLive(demo);
    })();
  }, [supabase, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const channel = subscribeToSessions(supabase, workspaceId, (payload) => {
      setSessions((prev) => applySessionChange(prev, payload).slice(0, 200));
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    if (demoLive && !stopSimulatorRef.current) {
      stopSimulatorRef.current = startDemoSimulator(supabase, workspaceId);
    } else if (!demoLive && stopSimulatorRef.current) {
      stopSimulatorRef.current();
      stopSimulatorRef.current = null;
    }
    return () => {
      stopSimulatorRef.current?.();
      stopSimulatorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoLive, workspaceId]);

  async function handleToggleDemoLive(checked: boolean) {
    if (!workspaceId) return;
    setDemoLive(checked);
    await setDemoLiveEnabled(supabase, workspaceId, checked);
    if (!checked) {
      await deleteDemoSessions(supabase, workspaceId);
      const wasSelectedDemo = sessions.some((x) => x.id === selectedId && x.isDemo);
      setSessions((s) => s.filter((x) => !x.isDemo));
      if (wasSelectedDemo) setSelectedId(null);
    }
  }

  async function handleDelete(id: string) {
    await deleteSession(supabase, id);
    setSessions((s) => s.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <h1 className="text-lg font-bold">מרכז שיחות</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Demo Live</span>
          <Switch checked={demoLive} onCheckedChange={handleToggleDemoLive} />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <SessionList sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />
        <SessionThread session={selected} />
        <SessionDetails session={selected} onDelete={handleDelete} />
      </div>
    </div>
  );
}
