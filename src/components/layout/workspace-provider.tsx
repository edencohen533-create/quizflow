"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getWorkspaceId } from "@/lib/supabase/queries";

// Every dashboard page independently called getWorkspaceId() on mount, each
// paying for an auth check + a workspaces query on every navigation even
// though the workspace never changes during a session. Resolving it once
// here and sharing it via context removes that redundant round trip.
//
// This is scoped to this provider's mount lifetime, not a module-level
// cache: sign-out navigates to /login (outside the (dashboard) layout that
// renders this provider), so the provider — and its cached value — is torn
// down and a fresh instance is created on the next login. No risk of one
// user's workspace id leaking into another user's session in the same tab.
const WorkspaceIdContext = createContext<string | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkspaceId(supabase).then((id) => {
      if (!cancelled) setWorkspaceId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return <WorkspaceIdContext.Provider value={workspaceId}>{children}</WorkspaceIdContext.Provider>;
}

// Returns null until resolved — callers already handle a null/loading
// workspaceId today (they gate their own data fetch on it being present).
export function useWorkspaceId(): string | null {
  return useContext(WorkspaceIdContext);
}
