import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";
import { QuizSession } from "@/lib/types";
import { QuizSessionRow, sessionRowToSession } from "./mappers";

export async function listLiveSessions(supabase: SupabaseClient, workspaceId: string): Promise<QuizSession[]> {
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("last_event_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as QuizSessionRow[]).map(sessionRowToSession);
}

export async function deleteSession(supabase: SupabaseClient, sessionId: string) {
  const { error } = await supabase.from("quiz_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

export async function deleteDemoSessions(supabase: SupabaseClient, workspaceId: string) {
  const { error } = await supabase.from("quiz_sessions").delete().eq("workspace_id", workspaceId).eq("is_demo", true);
  if (error) throw error;
}

export async function getDemoLiveEnabled(supabase: SupabaseClient, workspaceId: string): Promise<boolean> {
  const { data } = await supabase.from("inbox_settings").select("demo_live_enabled").eq("workspace_id", workspaceId).maybeSingle();
  return data?.demo_live_enabled ?? false;
}

export async function setDemoLiveEnabled(supabase: SupabaseClient, workspaceId: string, enabled: boolean) {
  const { error } = await supabase
    .from("inbox_settings")
    .upsert({ workspace_id: workspaceId, demo_live_enabled: enabled, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function subscribeToSessions(
  supabase: SupabaseClient,
  workspaceId: string,
  onChange: (payload: RealtimePostgresChangesPayload<QuizSessionRow>) => void
): RealtimeChannel {
  return supabase
    .channel(`quiz-sessions-${workspaceId}`)
    .on<QuizSessionRow>(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_sessions", filter: `workspace_id=eq.${workspaceId}` },
      onChange
    )
    .subscribe();
}

// Applies one realtime change to an already-loaded, last_event_at-desc
// sorted session list, without refetching all 200 rows on every event.
export function applySessionChange(
  sessions: QuizSession[],
  payload: RealtimePostgresChangesPayload<QuizSessionRow>
): QuizSession[] {
  if (payload.eventType === "DELETE") {
    const deletedId = (payload.old as { id?: string }).id;
    return deletedId ? sessions.filter((s) => s.id !== deletedId) : sessions;
  }
  const updated = sessionRowToSession(payload.new);
  const withoutOld = sessions.filter((s) => s.id !== updated.id);
  return [updated, ...withoutOld].sort((a, b) => (a.lastEventAt < b.lastEventAt ? 1 : -1));
}
