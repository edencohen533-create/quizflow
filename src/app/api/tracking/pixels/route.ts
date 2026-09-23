import { NextResponse } from "next/server";
import { securePost, HttpError } from "@/lib/security/http";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { TIKTOK_PIXEL_ID } from "@/lib/tiktok-pixel";

// Public pixel identifiers only. Integration credentials never leave the server.
export const POST = securePost(async (request) => {
  const { admin, quiz } = await requirePublicQuiz(request);
  const { data, error } = await admin.from("integrations")
    .select("pixel_id").eq("quiz_id", quiz.id).eq("workspace_id", quiz.workspaceId)
    .eq("kind", "tiktok_pixel").eq("enabled", true);
  if (error) throw new HttpError(503, "Could not load pixels");
  return NextResponse.json({ tiktokPixelIds: [...new Set((data ?? []).map(row => row.pixel_id).filter(id => typeof id === "string" && TIKTOK_PIXEL_ID.test(id)))] });
});
