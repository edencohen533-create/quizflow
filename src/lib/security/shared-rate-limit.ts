import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sharedBudget(req: Request, scope?: string, limit?: number): Promise<boolean> {
  const path = scope ?? new URL(req.url).pathname;
  const ip = process.env.VERCEL === "1" ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown" : "local";
  const secret = process.env.QUIZ_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Rate limit configuration missing");
  const key = createHmac("sha256", secret).update(new Date().toISOString().slice(0,10) + ":" + ip + ":" + path).digest("hex");
  const budget = limit ?? (path.endsWith("/relay-webhook") || path.endsWith("/test-meta") ? 10 : path.endsWith("/quiz-submissions") || path.endsWith("/save-token") ? 20 : 180);
  const { data, error } = await createAdminClient().rpc("consume_request_budget", { p_key:key, p_limit:budget, p_seconds:60 });
  if (error) throw new Error("Rate limit unavailable");
  return data === true;
}
