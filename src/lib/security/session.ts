import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PublicSession } from "@/lib/public-session";
import { HttpError, isRecord, uuid } from "./http";

const LIFETIME = 4 * 60 * 60;
interface Claims {
  v: 1;
  quizId: string;
  workspaceId: string;
  sessionId: string;
  leadId: string;
  submissionId: string;
  iat: number;
  exp: number;
}
function signingKey(secret = process.env.QUIZ_SESSION_SECRET) {
  if (!secret || secret.length < 32) throw new HttpError(503, "Session service unavailable");
  // Domain-separated derived key; never send the key itself to the client.
  return createHmac("sha256", secret).update("quizflow/public-session/v1").digest();
}
export function issuePublicSession(quizId: string, workspaceId: string, now = Date.now()): PublicSession {
  uuid(quizId); uuid(workspaceId);
  const claims: Claims = { v: 1, quizId, workspaceId, sessionId: randomUUID(), leadId: randomUUID(), submissionId: randomUUID(), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + LIFETIME };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return { sessionId: claims.sessionId, leadId: claims.leadId, submissionId: claims.submissionId, token: payload + "." + signature };
}
export function verifyPublicSession(req: Request, now = Date.now()): Claims {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 2048) throw new HttpError(401, "Session required");
  const parts = header.slice(7).split(".");
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) throw new HttpError(401, "Invalid session");
  const supplied = Buffer.from(parts[1], "base64url");
  const keys = [signingKey()];
  const previous = process.env.QUIZ_SESSION_PREVIOUS_SECRET;
  const until = Date.parse(process.env.QUIZ_SESSION_PREVIOUS_VALID_UNTIL || "");
  // Verification-only grace: new capabilities are always signed by the primary key.
  // Expired/missing/invalid deadlines never enable the retired key.
  if (previous && previous.length >= 32 && Number.isFinite(until) && now < until) keys.push(signingKey(previous));
  const matches = keys.map(key => {
    const expected = createHmac("sha256", key).update(parts[0]).digest();
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
  if (!matches.some(Boolean)) throw new HttpError(401, "Invalid session");
  let c: unknown;
  try { c = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new HttpError(401, "Invalid session"); }
  if (!isRecord(c) || c.v !== 1 || typeof c.exp !== "number" || typeof c.iat !== "number" ||
      c.exp <= now / 1000 || c.iat > now / 1000 + 30 || c.exp - c.iat !== LIFETIME) throw new HttpError(401, "Session expired or invalid");
  for (const key of ["quizId", "workspaceId", "sessionId", "leadId", "submissionId"]) {
    try { uuid(c[key]); } catch { throw new HttpError(401, "Invalid session"); }
  }
  return c as unknown as Claims;
}
