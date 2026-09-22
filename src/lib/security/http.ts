import { sharedBudget } from "./shared-rate-limit";
import { allowRequest } from "./rate-limit";
import { NextRequest, NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function stringField(value: unknown, max = 256, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, "Missing field");
    return "";
  }
  if (typeof value !== "string" || value.length > max || Array.from(value).some((c) => { const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 && n !== 13; }) || (required && !value.trim())) {
    throw new HttpError(400, "Invalid field");
  }
  return value;
}
export function uuid(value: unknown): string {
  const result = stringField(value, 36, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, "Invalid identifier");
  return result;
}

// Bound the actual stream, not just the attacker-controlled Content-Length.
export async function readJson(req: Request, limit = 64 * 1024): Promise<Record<string, unknown>> {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, "Origin not allowed");
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "Expected JSON");
  if (Number(req.headers.get("content-length")) > limit) throw new HttpError(413, "Request too large");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Invalid JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, "Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Invalid JSON"); }
  if (!isRecord(body)) throw new HttpError(400, "Expected JSON object");
  return body;
}

export function securePost(handler: (req: NextRequest, body: Record<string, unknown>) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    try {
      if (!allowRequest(req) || !await sharedBudget(req)) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
      const response = await handler(req, await readJson(req));
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      // Never expose database messages, tokens, upstream bodies, or stack traces.
      return NextResponse.json({ ok: false, error: error instanceof HttpError ? error.message : "Request failed" }, {
        status: error instanceof HttpError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      });
    }
  };
}
