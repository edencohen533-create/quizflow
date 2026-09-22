import type { SupabaseClient } from "@supabase/supabase-js";

const QUIZ_MEDIA_BUCKET = "quiz-media";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadQuizImage(supabase: SupabaseClient, file: File): Promise<string> {
  const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
  if (!extensions[file.type]) {
    throw new Error("הקובץ שנבחר אינו תמונה");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("התמונה גדולה מדי (מקסימום 5MB)");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("יש להתחבר כדי להעלות תמונה");
  const path = `${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error } = await supabase.storage.from(QUIZ_MEDIA_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(QUIZ_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
