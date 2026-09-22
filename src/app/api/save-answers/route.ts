import { NextResponse } from "next/server";

// Retired: answers now belong to the signed /api/quiz-submissions operation.
// Never keep an unauthenticated service-role write as a compatibility fallback.
export async function POST() {
  return NextResponse.json({ ok: false, error: "Reload the quiz to submit" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
