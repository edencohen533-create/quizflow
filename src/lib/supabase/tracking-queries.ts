import type { SupabaseClient } from "@supabase/supabase-js";
import {
  QuizTrackingActivity,
  QuizTrackingEvent,
  QuizTrackingSettings,
  TrackingCondition,
  TrackingEventName,
} from "@/lib/types";

interface SettingsRow {
  quiz_id: string;
  meta_pixel_id: string | null;
  meta_has_token: boolean;
  meta_last_test_status: "untested" | "success" | "error";
  meta_last_test_error: string | null;
  meta_last_test_at: string | null;
  gtm_container_id: string | null;
  updated_at: string;
}

interface EventRow {
  id: string;
  quiz_id: string;
  name: TrackingEventName;
  custom_name: string | null;
  trigger_node_id: string | null;
  send_to_pixel: boolean;
  send_to_capi: boolean;
  send_to_gtm: boolean;
  send_to_custom_code: boolean;
  custom_code: string | null;
  condition_field: string | null;
  condition_operator: TrackingCondition["operator"] | null;
  condition_value: string | null;
  value: number | null;
  currency: string | null;
  enabled: boolean;
  created_at: string;
}

function rowToSettings(row: SettingsRow): QuizTrackingSettings {
  return {
    quizId: row.quiz_id,
    metaPixelId: row.meta_pixel_id ?? undefined,
    metaHasToken: row.meta_has_token,
    metaLastTestStatus: row.meta_last_test_status,
    metaLastTestError: row.meta_last_test_error ?? undefined,
    metaLastTestAt: row.meta_last_test_at ?? undefined,
    gtmContainerId: row.gtm_container_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

function rowToEvent(row: EventRow): QuizTrackingEvent {
  return {
    id: row.id,
    quizId: row.quiz_id,
    name: row.name,
    customName: row.custom_name ?? undefined,
    triggerNodeId: row.trigger_node_id,
    sendToPixel: row.send_to_pixel,
    sendToCapi: row.send_to_capi,
    sendToGtm: row.send_to_gtm,
    sendToCustomCode: row.send_to_custom_code,
    customCode: row.custom_code ?? undefined,
    condition:
      row.condition_field && row.condition_operator && row.condition_value != null
        ? { field: row.condition_field, operator: row.condition_operator, value: row.condition_value }
        : undefined,
    value: row.value ?? undefined,
    currency: row.currency ?? undefined,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

const DEFAULT_SETTINGS: Omit<QuizTrackingSettings, "quizId" | "updatedAt"> = {
  metaHasToken: false,
  metaLastTestStatus: "untested",
};

export async function getTrackingSettings(supabase: SupabaseClient, quizId: string): Promise<QuizTrackingSettings> {
  const { data } = await supabase.from("quiz_tracking_settings").select("*").eq("quiz_id", quizId).maybeSingle();
  if (data) return rowToSettings(data);
  return { quizId, updatedAt: new Date().toISOString(), ...DEFAULT_SETTINGS };
}

export async function updateTrackingSettings(
  supabase: SupabaseClient,
  quizId: string,
  patch: Partial<{ metaPixelId: string | null; gtmContainerId: string | null }>
) {
  const row: Record<string, unknown> = { quiz_id: quizId, updated_at: new Date().toISOString() };
  if (patch.metaPixelId !== undefined) row.meta_pixel_id = patch.metaPixelId;
  if (patch.gtmContainerId !== undefined) row.gtm_container_id = patch.gtmContainerId;
  const { error } = await supabase.from("quiz_tracking_settings").upsert(row);
  if (error) throw error;
}

export async function listTrackingEvents(supabase: SupabaseClient, quizId: string): Promise<QuizTrackingEvent[]> {
  const { data, error } = await supabase
    .from("quiz_tracking_events")
    .select("*")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToEvent);
}

export interface TrackingEventInput {
  name: TrackingEventName;
  customName?: string;
  triggerNodeId: string | null;
  sendToPixel: boolean;
  sendToCapi: boolean;
  sendToGtm: boolean;
  sendToCustomCode: boolean;
  customCode?: string;
  condition?: TrackingCondition;
  value?: number;
  currency?: string;
  enabled: boolean;
}

export async function createTrackingEvent(supabase: SupabaseClient, quizId: string, input: TrackingEventInput): Promise<QuizTrackingEvent> {
  const { data, error } = await supabase
    .from("quiz_tracking_events")
    .insert({
      quiz_id: quizId,
      name: input.name,
      custom_name: input.customName ?? null,
      trigger_node_id: input.triggerNodeId,
      send_to_pixel: input.sendToPixel,
      send_to_capi: input.sendToCapi,
      send_to_gtm: input.sendToGtm,
      send_to_custom_code: input.sendToCustomCode,
      custom_code: input.customCode ?? null,
      condition_field: input.condition?.field ?? null,
      condition_operator: input.condition?.operator ?? null,
      condition_value: input.condition?.value ?? null,
      value: input.value ?? null,
      currency: input.currency ?? "ILS",
      enabled: input.enabled,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToEvent(data);
}

export async function updateTrackingEvent(supabase: SupabaseClient, id: string, input: Partial<TrackingEventInput>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) row.name = input.name;
  if (input.customName !== undefined) row.custom_name = input.customName;
  if (input.triggerNodeId !== undefined) row.trigger_node_id = input.triggerNodeId;
  if (input.sendToPixel !== undefined) row.send_to_pixel = input.sendToPixel;
  if (input.sendToCapi !== undefined) row.send_to_capi = input.sendToCapi;
  if (input.sendToGtm !== undefined) row.send_to_gtm = input.sendToGtm;
  if (input.sendToCustomCode !== undefined) row.send_to_custom_code = input.sendToCustomCode;
  if (input.customCode !== undefined) row.custom_code = input.customCode;
  if (input.condition !== undefined) {
    row.condition_field = input.condition?.field ?? null;
    row.condition_operator = input.condition?.operator ?? null;
    row.condition_value = input.condition?.value ?? null;
  }
  if (input.value !== undefined) row.value = input.value;
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.enabled !== undefined) row.enabled = input.enabled;
  const { error } = await supabase.from("quiz_tracking_events").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteTrackingEvent(supabase: SupabaseClient, id: string) {
  await supabase.from("quiz_tracking_events").delete().eq("id", id);
}

export async function duplicateTrackingEvent(supabase: SupabaseClient, quizId: string, event: QuizTrackingEvent) {
  return createTrackingEvent(supabase, quizId, {
    name: event.name,
    customName: event.customName,
    triggerNodeId: event.triggerNodeId,
    sendToPixel: event.sendToPixel,
    sendToCapi: event.sendToCapi,
    sendToGtm: event.sendToGtm,
    sendToCustomCode: event.sendToCustomCode,
    customCode: event.customCode,
    condition: event.condition,
    value: event.value,
    currency: event.currency,
    enabled: event.enabled,
  });
}

export async function seedDefaultTrackingEvents(supabase: SupabaseClient, quizId: string) {
  await supabase.from("quiz_tracking_events").insert([
    {
      quiz_id: quizId,
      name: "PageView",
      trigger_node_id: null,
      send_to_pixel: true,
      send_to_capi: true,
      send_to_gtm: false,
      enabled: true,
    },
    {
      quiz_id: quizId,
      name: "Lead",
      trigger_node_id: "__lead_details__",
      send_to_pixel: true,
      send_to_capi: true,
      send_to_gtm: false,
      enabled: true,
    },
    {
      quiz_id: quizId,
      name: "CompleteRegistration",
      trigger_node_id: "__end__",
      send_to_pixel: true,
      send_to_capi: true,
      send_to_gtm: false,
      enabled: false,
    },
  ]);
}

export async function listTrackingActivity(supabase: SupabaseClient, quizId: string): Promise<QuizTrackingActivity[]> {
  const { data, error } = await supabase
    .from("quiz_tracking_activity")
    .select("*")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, quizId: r.quiz_id, message: r.message, createdAt: r.created_at }));
}

export async function logTrackingActivity(supabase: SupabaseClient, quizId: string, message: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("quiz_tracking_activity").insert({ quiz_id: quizId, message, created_by: user?.id ?? null });
}
