type PixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: PixelFunction;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: PixelFunction;
    _qfMetaInitialized?: Set<string>;
  }
}

export const META_PIXEL_ID = /^\d{5,30}$/;

export function loadMetaPixel(pixelId: string): boolean {
  if (typeof window === "undefined" || !META_PIXEL_ID.test(pixelId)) return false;
  const initialized = window._qfMetaInitialized ??= new Set<string>();
  if (initialized.has(pixelId)) return true;
  if (!window.fbq) {
    const fbq: PixelFunction = Object.assign((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    }, { queue: [] as unknown[][] });
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  window.fbq("init", pixelId);
  initialized.add(pixelId);
  return true;
}

export function sendMetaPixelEvent(
  pixelId: string, eventName: string, custom: boolean,
  parameters: Record<string, unknown> = {}, eventId?: string,
) {
  if (!loadMetaPixel(pixelId)) return;
  // Restrict delivery to this quiz's pixel even when another pixel is initialized.
  window.fbq?.(
    custom ? "trackSingleCustom" : "trackSingle",
    pixelId, eventName, parameters,
    ...(eventId ? [{ eventID: eventId }] : []),
  );
}
