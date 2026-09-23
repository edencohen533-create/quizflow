// Author-provided JavaScript/GTM must not execute in the dashboard's origin.
// Opaque-origin frames intentionally cannot read parent cookies/localStorage.
// Custom snippets that require parent DOM access must be rewritten.
const frames = new Map<string, HTMLIFrameElement>();

export function trackingSandbox(key: string, containerId?: string, pixelId?: string): HTMLIFrameElement | undefined {
  if (typeof document === "undefined") return undefined;
  const existing = frames.get(key);
  if (existing?.isConnected) return existing;
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Tracking");
  frame.referrerPolicy = "no-referrer";
  frame.style.display = "none";
  const gtm = containerId && /^GTM-[A-Z0-9]+$/.test(containerId) ? containerId : null;
  const pixel = pixelId && /^\d{5,30}$/.test(pixelId) ? pixelId : null;
  const params = new URLSearchParams();
  if (gtm) params.set("gtm", gtm);
  if (pixel) params.set("pixel", pixel);
  // A separate response avoids inheriting the parent's nonce-only script policy.
  // Its own CSP enforces an opaque sandbox even if opened as a top-level page.
  frame.src = "/api/tracking/sandbox?" + params.toString();
  frames.set(key, frame);
  document.body.appendChild(frame);
  return frame;
}
export function sendSandboxTracking(key: string, payload: { event?: Record<string, unknown>; code?: string }, containerId?: string, pixelId?: string) {
  const existing = frames.get(key);
  const frame = trackingSandbox(key, containerId, pixelId);
  if (!frame) return;
  const send = () => frame.contentWindow?.postMessage({ kind: "quizflow-tracking", ...payload }, "*");
  // "*" is required for an opaque origin. The target is this specific frame,
  // and no secrets/PII are included. There is no message handler in the parent.
  if (existing === frame && frame.dataset.ready) send();
  else frame.addEventListener("load", () => { frame.dataset.ready = "true"; send(); }, { once: true });
}
