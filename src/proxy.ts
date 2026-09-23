import { type NextRequest } from "next/server";
import { pageCsp } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || path === "/embed.js") return updateSession(request);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = pageCsp(nonce, path.startsWith("/q/"), process.env.NODE_ENV === "development");
  // Overwrite visitor-supplied headers before Next renders framework scripts.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
