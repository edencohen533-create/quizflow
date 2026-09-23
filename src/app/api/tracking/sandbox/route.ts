function scriptJson(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawGtm = params.get("gtm") || "", rawPixel = params.get("pixel") || "";
  const gtm = /^GTM-[A-Z0-9]+$/.test(rawGtm) ? rawGtm : null;
  const pixel = /^\d{5,30}$/.test(rawPixel) ? rawPixel : null;
  const html = '<!doctype html><meta charset="utf-8"><script>' +
    'window.dataLayer=[];const gtm=' + scriptJson(gtm) + ';const pixel=' + scriptJson(pixel) + ';' +
    'if(pixel){const fbq=window.fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};fbq.queue=[];fbq.push=fbq;fbq.loaded=true;fbq.version="2.0";window._fbq=fbq;const s=document.createElement("script");s.src="https://connect.facebook.net/en_US/fbevents.js";document.head.appendChild(s);fbq("init",pixel);}' +
    'if(gtm){dataLayer.push({"gtm.start":Date.now(),event:"gtm.js"});const s=document.createElement("script");s.src="https://www.googletagmanager.com/gtm.js?id="+gtm;document.head.appendChild(s);}' +
    'addEventListener("message",e=>{if(e.source!==parent||!e.data||e.data.kind!=="quizflow-tracking")return;' +
    'if(e.data.event)dataLayer.push(e.data.event);' +
    'if(typeof e.data.code==="string"){try{new Function(e.data.code)()}catch{}}});' +
    '</script>';
  return new Response(html, {headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    // This sandbox is mandatory even when this URL is opened outside an iframe.
    "Content-Security-Policy": "sandbox allow-scripts; default-src https: data:; script-src https: 'unsafe-inline' 'unsafe-eval'; connect-src https:; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors *",
  }});
}
