import type { SupabaseClient } from "@supabase/supabase-js";

const QUIZ_MEDIA_BUCKET = "quiz-media";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadQuizImage(supabase: SupabaseClient, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("הקובץ שנבחר אינו תמונה");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("התמונה גדולה מדי (מקסימום 5MB)");
  }
  const ext = file.name.split(".").pop() || "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(QUIZ_MEDIA_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(QUIZ_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
