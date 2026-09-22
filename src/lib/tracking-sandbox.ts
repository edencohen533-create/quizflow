// Author-provided JavaScript/GTM must not execute in the dashboard's origin.
// Opaque-origin frames intentionally cannot read parent cookies/localStorage.
// Custom snippets that require parent DOM access must be rewritten.
const frames = new Map<string, HTMLIFrameElement>();

function scriptJson(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
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
  frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src https: data:; script-src https: \'unsafe-inline\' \'unsafe-eval\'; connect-src https:; form-action \'none\'; base-uri \'none\'"><script>' +
    'window.dataLayer=[];const gtm=' + scriptJson(gtm) + ';const pixel=' + scriptJson(pixel) + ';' +
    'if(pixel){const fbq=window.fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};fbq.queue=[];fbq.push=fbq;fbq.loaded=true;fbq.version="2.0";window._fbq=fbq;const s=document.createElement("script");s.src="https://connect.facebook.net/en_US/fbevents.js";document.head.appendChild(s);fbq("init",pixel);}' +
    'if(gtm){dataLayer.push({"gtm.start":Date.now(),event:"gtm.js"});const s=document.createElement("script");s.src="https://www.googletagmanager.com/gtm.js?id="+gtm;document.head.appendChild(s);}' +
    'addEventListener("message",e=>{if(e.source!==parent||!e.data||e.data.kind!=="quizflow-tracking")return;' +
    'if(e.data.event)dataLayer.push(e.data.event);' +
    'if(typeof e.data.code==="string"){try{new Function(e.data.code)()}catch{}}});' +
    '</script>';
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
