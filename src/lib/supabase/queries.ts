import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Integration,
  IntegrationKind,
  Lead,
  LeadAnswer,
  LeadStatus,
  Quiz,
  QuizEdge,
  QuizNode,
  QuizStatus,
  QuizTheme,
  THEME_PRESETS,
} from "@/lib/types";
import {
  LeadRow,
  QuizEdgeRow,
  QuizNodeRow,
  QuizRow,
  QuizThemeRow,
  edgeToRow,
  leadRowToLead,
  nodeToRow,
  quizRowToQuiz,
  themeRowToTheme,
  themeToRow,
} from "./mappers";

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^֐-׿a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || Math.random().toString(36).slice(2, 8)
  );
}

export async function getWorkspaceId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");

  const { data, error } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).limit(1).maybeSingle();
  if (error) throw error;
  if (data) return data.id;

  const { data: created, error: createError } = await supabase
    .from("workspaces")
    .insert({ owner_id: user.id, name: "workspace ראשי" })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

export async function listQuizzes(supabase: SupabaseClient, workspaceId: string): Promise<Quiz[]> {
  const [{ data: quizRows, error }, { data: themeRows }] = await Promise.all([
    supabase.from("quizzes").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    supabase.from("quiz_themes").select("*"),
  ]);
  if (error) throw error;
  const themesByQuiz = new Map((themeRows ?? []).map((t: QuizThemeRow) => [t.quiz_id, t]));
  return (quizRows ?? []).map((q: QuizRow) =>
    quizRowToQuiz(q, [], [], themesByQuiz.get(q.id) ?? defaultThemeRow(q.id))
  );
}

function defaultThemeRow(quizId: string): QuizThemeRow {
  return themeToRow(quizId, THEME_PRESETS.clean_light);
}

async function fetchQuizFlow(supabase: SupabaseClient, quizId: string) {
  const [{ data: nodeRows }, { data: edgeRows }, { data: themeRow }] = await Promise.all([
    supabase.from("quiz_nodes").select("*").eq("quiz_id", quizId),
    supabase.from("quiz_edges").select("*").eq("quiz_id", quizId),
    supabase.from("quiz_themes").select("*").eq("quiz_id", quizId).maybeSingle(),
  ]);
  return {
    nodeRows: (nodeRows ?? []) as QuizNodeRow[],
    edgeRows: (edgeRows ?? []) as QuizEdgeRow[],
    themeRow: (themeRow as QuizThemeRow | null) ?? defaultThemeRow(quizId),
  };
}

export async function fetchQuizFull(supabase: SupabaseClient, quizId: string): Promise<Quiz | null> {
  // The quiz row and its flow (nodes/edges/theme) don't depend on each
  // other — both only need quizId, which is already known — so fetch them
  // concurrently instead of waiting on the quiz row first.
  const [{ data: quizRow, error }, flow] = await Promise.all([
    supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle(),
    fetchQuizFlow(supabase, quizId),
  ]);
  if (error) throw error;
  if (!quizRow) return null;
  return quizRowToQuiz(quizRow, flow.nodeRows, flow.edgeRows, flow.themeRow);
}

export async function fetchQuizFullBySlug(supabase: SupabaseClient, slug: string): Promise<Quiz | null> {
  // no status filter here: RLS already restricts anonymous visitors to
  // active quizzes (quizzes_public_read_active) while letting the owner
  // see their own quiz regardless of status (quizzes_owner_all) — this is
  // what makes "preview" work for draft/paused quizzes.
  const { data: quizRow, error } = await supabase.from("quizzes").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!quizRow) return null;
  const { nodeRows, edgeRows, themeRow } = await fetchQuizFlow(supabase, quizRow.id);
  return quizRowToQuiz(quizRow, nodeRows, edgeRows, themeRow);
}

export async function createQuiz(
  supabase: SupabaseClient,
  workspaceId: string,
  input: { name: string; description?: string }
): Promise<Quiz> {
  const { data: quizRow, error } = await supabase
    .from("quizzes")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      description: input.description ?? null,
      slug: slugify(input.name),
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;

  const startNode: QuizNode = { id: `start-${Date.now()}`, type: "start", position: { x: 0, y: 0 }, data: { kind: "start" } };
  const endNode: QuizNode = {
    id: `end-${Date.now()}`,
    type: "end",
    position: { x: 350, y: 0 },
    data: { kind: "end", title: "תודה רבה!", text: "קיבלנו את הפרטים שלך.", ctaLabel: "", ctaUrl: "" },
  };
  const startToEndEdge: QuizEdge = { id: `edge-${Date.now()}`, source: startNode.id, sourceHandle: null, target: endNode.id };

  await supabase.from("quiz_nodes").insert([nodeToRow(quizRow.id, startNode), nodeToRow(quizRow.id, endNode)]);
  await supabase.from("quiz_edges").insert(edgeToRow(quizRow.id, startToEndEdge));
  const theme = THEME_PRESETS.clean_light;
  await supabase.from("quiz_themes").insert(themeToRow(quizRow.id, theme));

  return quizRowToQuiz(
    quizRow,
    [nodeToRow(quizRow.id, startNode), nodeToRow(quizRow.id, endNode)],
    [edgeToRow(quizRow.id, startToEndEdge)],
    themeToRow(quizRow.id, theme)
  );
}

export async function updateQuizMeta(
  supabase: SupabaseClient,
  quizId: string,
  patch: Partial<{ name: string; description: string; status: QuizStatus; allowBack: boolean }>
) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.allowBack !== undefined) row.allow_back = patch.allowBack;
  const { error } = await supabase.from("quizzes").update(row).eq("id", quizId);
  if (error) throw error;
}

export async function updateQuizTheme(supabase: SupabaseClient, quizId: string, theme: QuizTheme) {
  const { error } = await supabase.from("quiz_themes").upsert(themeToRow(quizId, theme));
  if (error) throw error;
}

export async function duplicateQuiz(supabase: SupabaseClient, quiz: Quiz): Promise<Quiz> {
  const { data: quizRow, error } = await supabase
    .from("quizzes")
    .insert({
      workspace_id: quiz.workspaceId,
      name: `${quiz.name} (עותק)`,
      description: quiz.description ?? null,
      slug: `${quiz.slug}-copy-${Math.floor(Math.random() * 10000)}`,
      status: "draft",
      allow_back: quiz.allowBack,
    })
    .select("*")
    .single();
  if (error) throw error;

  if (quiz.nodes.length) await supabase.from("quiz_nodes").insert(quiz.nodes.map((n) => nodeToRow(quizRow.id, n)));
  if (quiz.edges.length) await supabase.from("quiz_edges").insert(quiz.edges.map((e) => edgeToRow(quizRow.id, e)));
  await supabase.from("quiz_themes").insert(themeToRow(quizRow.id, quiz.theme));

  return quizRowToQuiz(
    quizRow,
    quiz.nodes.map((n) => nodeToRow(quizRow.id, n)),
    quiz.edges.map((e) => edgeToRow(quizRow.id, e)),
    themeToRow(quizRow.id, quiz.theme)
  );
}

export async function deleteQuiz(supabase: SupabaseClient, quizId: string) {
  const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
  if (error) throw error;
}

export async function saveFlow(supabase: SupabaseClient, quizId: string, nodes: QuizNode[], edges: QuizEdge[]) {
  await supabase.from("quiz_nodes").delete().eq("quiz_id", quizId);
  await supabase.from("quiz_edges").delete().eq("quiz_id", quizId);
  if (nodes.length) {
    const { error } = await supabase.from("quiz_nodes").insert(nodes.map((n) => nodeToRow(quizId, n)));
    if (error) throw error;
  }
  if (edges.length) {
    const { error } = await supabase.from("quiz_edges").insert(edges.map((e) => edgeToRow(quizId, e)));
    if (error) throw error;
  }
  await supabase.from("quizzes").update({ updated_at: new Date().toISOString() }).eq("id", quizId);
}

// ---------------- Leads ----------------

// Lightweight variant for screens that only need per-quiz lead counts (e.g.
// the quizzes list's "X leads this month" stat) — avoids listLeads()'s full
// fetch (notes/history/answers batched per lead) when only quiz_id and
// created_at are needed.
export async function listLeadCounts(supabase: SupabaseClient, workspaceId: string): Promise<{ quizId: string; createdAt: string }[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("quiz_id, created_at")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ quizId: r.quiz_id as string, createdAt: r.created_at as string }));
}

export async function listLeads(supabase: SupabaseClient, workspaceId: string): Promise<Lead[]> {
  const { data: leadRows, error } = await supabase
    .from("leads")
    .select("*, quizzes(name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (leadRows ?? []) as LeadRow[];
  if (rows.length === 0) return [];

  const leadIds = rows.map((r) => r.id);
  const [{ data: notesRows }, { data: historyRows }, { data: submissionRows }] = await Promise.all([
    supabase.from("lead_notes").select("*").in("lead_id", leadIds),
    supabase.from("lead_status_history").select("*").in("lead_id", leadIds).order("created_at", { ascending: true }),
    supabase.from("quiz_submissions").select("id, lead_id").in("lead_id", leadIds),
  ]);

  const submissionIds = (submissionRows ?? []).map((s: { id: string }) => s.id);
  const submissionToLead = new Map((submissionRows ?? []).map((s: { id: string; lead_id: string }) => [s.id, s.lead_id]));
  const { data: answerRows } = submissionIds.length
    ? await supabase.from("submission_answers").select("*").in("submission_id", submissionIds)
    : { data: [] };

  const answersByLead = new Map<string, LeadAnswer[]>();
  for (const a of answerRows ?? []) {
    const leadId = submissionToLead.get(a.submission_id);
    if (!leadId) continue;
    const list = answersByLead.get(leadId) ?? [];
    list.push({ nodeId: a.node_id, questionTitle: a.question_title ?? "", answerLabel: a.answer_label ?? "", score: a.score });
    answersByLead.set(leadId, list);
  }

  const notesByLead = new Map<string, { id: string; text: string; createdAt: string }[]>();
  for (const n of notesRows ?? []) {
    const list = notesByLead.get(n.lead_id) ?? [];
    list.push({ id: n.id, text: n.text, createdAt: n.created_at });
    notesByLead.set(n.lead_id, list);
  }

  const historyByLead = new Map<string, { status: LeadStatus; at: string }[]>();
  for (const h of historyRows ?? []) {
    const list = historyByLead.get(h.lead_id) ?? [];
    list.push({ status: h.status, at: h.created_at });
    historyByLead.set(h.lead_id, list);
  }

  return rows.map((row) =>
    leadRowToLead(row, answersByLead.get(row.id) ?? [], notesByLead.get(row.id) ?? [], historyByLead.get(row.id) ?? [])
  );
}

export async function updateLeadStatus(supabase: SupabaseClient, leadId: string, status: LeadStatus) {
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw error;
  await supabase.from("lead_status_history").insert({ lead_id: leadId, status });
}

export async function addLeadNote(supabase: SupabaseClient, leadId: string, text: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("lead_notes").insert({ lead_id: leadId, text, created_by: user?.id ?? null });
  if (error) throw error;
}

// Public (anonymous-safe) submission path: ids are generated client-side so we
// never need a SELECT back on rows that anon isn't allowed to read.
export async function submitPublicQuizResponse(
  supabase: SupabaseClient,
  quiz: Quiz,
  lead: {
    name: string;
    phone: string;
    email: string;
    score: number;
    category: "hot" | "warm" | "cold";
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
  },
  answers: LeadAnswer[]
) {
  const leadId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();

  const { error: leadError } = await supabase.from("leads").insert({
    id: leadId,
    workspace_id: quiz.workspaceId,
    quiz_id: quiz.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    score: lead.score,
    category: lead.category,
    status: "new",
    utm_source: lead.utmSource ?? null,
    utm_medium: lead.utmMedium ?? null,
    utm_campaign: lead.utmCampaign ?? null,
    utm_content: lead.utmContent ?? null,
  });
  if (leadError) throw leadError;

  await supabase.from("quiz_submissions").insert({
    id: submissionId,
    quiz_id: quiz.id,
    lead_id: leadId,
    score: lead.score,
    category: lead.category,
    utm_source: lead.utmSource ?? null,
    utm_medium: lead.utmMedium ?? null,
    utm_campaign: lead.utmCampaign ?? null,
  });

  if (answers.length) {
    // submission_answers' RLS check needs to read quiz_submissions, which anon
    // has no SELECT policy on (nested-RLS gap) — route this write through a
    // server route holding the service-role key instead of inserting directly.
    await fetch("/api/save-answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, answers }),
    }).catch(() => {});
  }

  return leadId;
}

export async function listAnalyticsEvents(supabase: SupabaseClient, quizId: string, sinceIso: string) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_type, created_at")
    .eq("quiz_id", quizId)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return (data ?? []) as { event_type: "view" | "start" | "complete"; created_at: string }[];
}

export interface QuestionDropoff {
  totalSessions: number;
  completedSessions: number;
  reachedByStep: number[];
}

// step i's "reached" count = sessions whose step_index is >= i, i.e. they were
// at or past that step when we last heard from them (including completed
// ones, whose final step_index already covers every step). Demo-simulated
// sessions are excluded so this reflects real visitor behavior only.
export async function getQuestionDropoff(supabase: SupabaseClient, quizId: string, stepCount: number): Promise<QuestionDropoff> {
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("step_index, status")
    .eq("quiz_id", quizId)
    .eq("is_demo", false);
  if (error) throw error;
  const rows = (data ?? []) as { step_index: number; status: "active" | "completed" }[];
  const reachedByStep = Array.from({ length: stepCount }, (_, i) => rows.filter((r) => r.step_index >= i).length);
  return {
    totalSessions: rows.length,
    completedSessions: rows.filter((r) => r.status === "completed").length,
    reachedByStep,
  };
}

export async function recordAnalyticsEvent(
  supabase: SupabaseClient,
  quizId: string,
  eventType: "view" | "start" | "complete",
  utmSource?: string
) {
  await supabase.from("analytics_events").insert({ quiz_id: quizId, event_type: eventType, utm_source: utmSource ?? null });
}

// ---------------- Integrations ----------------

interface IntegrationRow {
  id: string;
  workspace_id: string;
  quiz_id: string | null;
  kind: IntegrationKind;
  name: string;
  enabled: boolean;
  url: string | null;
  secret: string | null;
  pixel_id: string | null;
  last_triggered_at: string | null;
  last_status: "success" | "error" | null;
  last_error: string | null;
  created_at: string;
}

function integrationRowToIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    quizId: row.quiz_id ?? undefined,
    kind: row.kind,
    name: row.name,
    enabled: row.enabled,
    url: row.url ?? undefined,
    secret: row.secret ?? undefined,
    pixelId: row.pixel_id ?? undefined,
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    lastStatus: row.last_status ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
  };
}

// Integrations are configured per quiz (not per workspace) — quizId scopes
// which bot's webhooks/pixels these are; workspaceId is still required
// alongside it purely because RLS checks workspace ownership.
export async function listIntegrationsForQuiz(supabase: SupabaseClient, quizId: string): Promise<Integration[]> {
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(integrationRowToIntegration);
}

export async function addIntegration(
  supabase: SupabaseClient,
  workspaceId: string,
  quizId: string,
  input: { kind: IntegrationKind; name: string; url?: string; secret?: string; pixelId?: string }
): Promise<Integration> {
  const { data, error } = await supabase
    .from("integrations")
    .insert({
      workspace_id: workspaceId,
      quiz_id: quizId,
      kind: input.kind,
      name: input.name,
      url: input.url ?? null,
      secret: input.secret ?? null,
      pixel_id: input.pixelId ?? null,
      enabled: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return integrationRowToIntegration(data);
}

export async function updateIntegration(supabase: SupabaseClient, id: string, patch: Partial<Integration>) {
  const row: Record<string, unknown> = {};
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.pixelId !== undefined) row.pixel_id = patch.pixelId;
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.secret !== undefined) row.secret = patch.secret;
  if (patch.name !== undefined) row.name = patch.name;
  const { error } = await supabase.from("integrations").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteIntegration(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("integrations").delete().eq("id", id);
  if (error) throw error;
}

export async function recordIntegrationResult(
  supabase: SupabaseClient,
  id: string,
  result: { status: "success" | "error"; error?: string }
) {
  await supabase
    .from("integrations")
    .update({ last_triggered_at: new Date().toISOString(), last_status: result.status, last_error: result.error ?? null })
    .eq("id", id);
}

export async function updateWorkspaceName(supabase: SupabaseClient, workspaceId: string, name: string) {
  const { error } = await supabase.from("workspaces").update({ name }).eq("id", workspaceId);
  if (error) throw error;
}

export async function updateProfileName(supabase: SupabaseClient, fullName: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  await supabase.auth.updateUser({ data: { full_name: fullName } });
}

export { themeRowToTheme };
