import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key — bypasses RLS entirely.
// Never import this from a "use client" component or expose its key to the browser.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
