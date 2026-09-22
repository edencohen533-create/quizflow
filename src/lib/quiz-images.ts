// Optimize only this project's public media. External/custom image URLs keep
// their existing direct-loading behavior and are not sent through the proxy.
export function isStoredQuizImage(src: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  if (!supabaseUrl) return false;
  try {
    const image = new URL(src);
    return image.protocol === "https:"
      && image.origin === new URL(supabaseUrl).origin
      && image.pathname.startsWith("/storage/v1/object/public/quiz-media/")
      && image.search === "";
  } catch {
    return false;
  }
}
