import { QuizSession, QuizSessionDisplayStatus } from "@/lib/types";

// The runner sends a heartbeat every 10s while its tab is visible (see
// quiz-runner.tsx), so a real visitor should never go quiet for long —
// this just needs to tolerate one or two missed beats before flipping.
export const LIVE_WINDOW_MS = 25_000;

export function displaySessionStatus(session: QuizSession, nowMs: number): QuizSessionDisplayStatus {
  if (session.status === "completed") return "completed";
  const staleMs = nowMs - new Date(session.lastEventAt).getTime();
  return staleMs < LIVE_WINDOW_MS ? "live" : "abandoned";
}

export function timeAgoLabel(iso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (diffSec < 5) return "עכשיו";
  if (diffSec < 60) return `לפני ${diffSec} שנ׳`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `לפני ${diffHr} שע׳`;
  return `לפני ${Math.floor(diffHr / 24)} ימים`;
}

export function durationLabel(startIso: string, endIso: string): string {
  const diffSec = Math.max(0, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} שניות`;
  const diffMin = Math.floor(diffSec / 60);
  const restSec = diffSec % 60;
  return `${diffMin} דק׳ ${restSec} שנ׳`;
}
