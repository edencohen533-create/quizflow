import { createHash } from "node:crypto";

// Stable UUID for retries/claims; callers include their signed random session ID.
export function operationId(scope: string, id: string): string {
  const hex = createHash("sha256").update(scope + "\0" + id).digest("hex");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
}
