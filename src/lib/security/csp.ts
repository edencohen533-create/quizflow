import "server-only";

export function pageCsp(nonce: string, publicQuiz: boolean, development = false) {
  if (!/^[A-Za-z0-9+/=_-]{16,128}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  const connections = ["'self'"];
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (url.protocol === "https:") connections.push(url.origin, "wss://" + url.host);
  } catch {}
  // Public quiz tracking can contact author-configured HTTPS integrations.
  if (publicQuiz) connections.push("https:", "wss:");
  if (development) connections.push("http://localhost:*", "ws://localhost:*");
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + (development ? " 'unsafe-eval'" : ""),
    "script-src-attr 'none'",
    // ReactFlow/theme styles require inline styles; script execution stays nonce-only.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src " + connections.join(" "),
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "media-src 'self' https: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors " + (publicQuiz ? "*" : "'self'"),
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
