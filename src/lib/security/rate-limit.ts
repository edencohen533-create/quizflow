import { createHash } from "node:crypto";

const buckets = new Map<string, { count: number; reset: number }>();
const WINDOW = 60_000;
const MAX_BUCKETS = 5000;

// Per-instance abuse protection, NOT a distributed quota. Production also needs
// a shared limiter/WAF rule; autoscaling creates independent buckets.
export function allowRequest(req: Request, now = Date.now()): boolean {
  const path = new URL(req.url).pathname;
  const limit = path.endsWith("/relay-webhook") || path.endsWith("/test-meta") ? 10
    : path.endsWith("/quiz-submissions") || path.endsWith("/save-token") ? 20 : 180;
  // Vercel replaces X-Forwarded-For; do not trust this header on arbitrary hosts.
  const ip = process.env.VERCEL === "1" ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown" : "local";
  const key = createHash("sha256").update(ip + ":" + path).digest("hex");
  const current = buckets.get(key);
  if (current && current.reset > now) return ++current.count <= limit;
  if (buckets.size >= MAX_BUCKETS) {
    for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key);
    if (buckets.size >= MAX_BUCKETS) return false;
  }
  buckets.set(key, { count: 1, reset: now + WINDOW });
  return true;
}
