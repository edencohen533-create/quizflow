import { sendMetaPixelEvent } from "./meta-pixel";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Integration } from "./types";
import { recordIntegrationResult } from "./supabase/queries";

function fireMetaPixel(pixelId: string) {
  sendMetaPixelEvent(pixelId, "Lead", false);
}

// Called from the PUBLIC (anonymous) quiz runtime after a successful submission.
// Webhooks and secrets never touch the browser — a server route holding the
// service-role key looks up the workspace's integrations and dispatches them,
// returning only which pixels to fire client-side.
export async function triggerIntegrations(leadId: string, token: string) {
  try {
    const res = await fetch("/api/dispatch-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ leadId }),
    });
    const data = await res.json().catch(() => ({ ok: false, pixels: [] }));
    for (const pixel of data.pixels ?? []) {
      if (pixel.kind === "meta_pixel") fireMetaPixel(pixel.pixelId);
      // TikTok is initialized and dispatched by the step-event runtime.
    }
  } catch {
    // best-effort — a failed integration dispatch should never block the quiz UX
  }
}

export async function testWebhook(supabase: SupabaseClient, integration: Integration): Promise<{ ok: boolean; error?: string }> {
  if (!integration.url) return { ok: false, error: "לא הוגדרה כתובת" };
  try {
    const res = await fetch("/api/relay-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId: integration.id }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    await recordIntegrationResult(supabase, integration.id, {
      status: data.ok ? "success" : "error",
      error: data.ok ? undefined : data.error || `HTTP ${data.status ?? "?"}`,
    });
    return { ok: !!data.ok, error: data.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : "שליחה נכשלה";
    await recordIntegrationResult(supabase, integration.id, { status: "error", error });
    return { ok: false, error };
  }
}
