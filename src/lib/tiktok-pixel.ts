type TikTokInstance = unknown[][] & { page: (...args: unknown[]) => void; track: (...args: unknown[]) => void };
type TikTokQueue = unknown[][] & {
  methods: string[];
  setAndDefer: (target: unknown[][], method: string) => void;
  _i: Record<string, TikTokInstance>;
  _t: Record<string, number>;
  _o: Record<string, Record<string, unknown>>;
  instance: (id: string) => TikTokInstance;
  load: (id: string, options?: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    ttq?: TikTokQueue;
    TiktokAnalyticsObject?: string;
    _qfTikTokEvents?: Set<string>;
  }
}
export const TIKTOK_PIXEL_ID = /^[A-Za-z0-9]{10,32}$/;
export const TIKTOK_EVENT_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,49}$/;

export function loadTikTokPixel(pixelId: string): boolean {
  if (typeof window === "undefined" || !TIKTOK_PIXEL_ID.test(pixelId)) return false;
  if (!window.ttq) {
    const queue = [] as unknown as TikTokQueue;
    queue.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    const defer = (target: unknown[][], method: string) => {
      Object.assign(target, { [method]: (...args: unknown[]) => target.push([method, ...args]) });
    };
    queue.setAndDefer = defer;
    for (const method of queue.methods) defer(queue, method);
    queue._i = {}; queue._t = {}; queue._o = {};
    queue.instance = id => {
      const instance = queue._i[id] ??= [] as unknown as TikTokInstance;
      for (const method of queue.methods) defer(instance, method);
      return instance;
    };
    queue.load = (id, options = {}) => {
      const instance = queue._i[id] = [] as unknown as TikTokInstance;
      Object.assign(instance, { _u: "https://analytics.tiktok.com/i18n/pixel/events.js" });
      queue._t[id] = Date.now(); queue._o[id] = options;
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + encodeURIComponent(id) + "&lib=ttq";
      document.head.appendChild(script);
    };
    window.TiktokAnalyticsObject = "ttq";
    window.ttq = queue;
  }
  if (!window.ttq._i?.[pixelId]) window.ttq.load(pixelId);
  return true;
}

export function sendTikTokPixelEvent(pixelId: string, eventName: string, parameters: Record<string, unknown> = {}, eventId?: string): boolean {
  if (!TIKTOK_EVENT_NAME.test(eventName) || !loadTikTokPixel(pixelId)) return false;
  const sent = window._qfTikTokEvents ??= new Set<string>();
  const key = eventId ? pixelId + ":" + eventName + ":" + eventId : undefined;
  if (key && sent.has(key)) return true;
  const instance = window.ttq!.instance(pixelId);
  if (eventName === "PageView") instance.page();
  else instance.track(eventName, parameters, ...(eventId ? [{ event_id: eventId }] : []));
  if (key) sent.add(key);
  return true;
}
