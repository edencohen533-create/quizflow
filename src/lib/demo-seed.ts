import type { SupabaseClient } from "@supabase/supabase-js";
import { QuizEdge, QuizNode, THEME_PRESETS } from "./types";
import { createQuiz, saveFlow, updateQuizMeta, updateQuizTheme } from "./supabase/queries";

function n(id: string, type: QuizNode["type"], x: number, y: number, data: QuizNode["data"]): QuizNode {
  return { id, type, position: { x, y }, data };
}

const nodes: QuizNode[] = [
  n("start-1", "start", 0, 0, { kind: "start" }),
  n("msg-1", "message", 320, 0, {
    kind: "message",
    text: "בואו נבדוק את ההתאמה שלך\n\nכמה שאלות קצרות שייקחו לך פחות מדקה, ויעזרו לנו להבין את הצרכים הפיננסיים שלך.",
    buttonLabel: "בואו נתחיל",
    autoAdvance: false,
    autoAdvanceSeconds: 3,
    nextNodeId: "q-age",
  }),
  n("q-age", "question", 640, 0, {
    kind: "question",
    title: "מהו גילך?",
    answerType: "single_choice",
    required: true,
    allowOther: false,
    combineAnswers: false,
    options: [
      { id: "o1", label: "עד 30", value: "under_30", score: 2, nextNodeId: "q-field" },
      { id: "o2", label: "31–45", value: "31_45", score: 5, nextNodeId: "q-field" },
      { id: "o3", label: "46–60", value: "46_60", score: 8, nextNodeId: "q-field" },
      { id: "o4", label: "60+", value: "60_plus", score: 4, nextNodeId: "q-field" },
    ],
    nextNodeId: null,
  }),
  n("q-field", "question", 960, 0, {
    kind: "question",
    title: "באיזה תחום עיסוק?",
    answerType: "single_choice",
    required: true,
    allowOther: true,
    combineAnswers: false,
    options: [
      { id: "o1", label: "שכיר", value: "employee", score: 4, nextNodeId: "q-income" },
      { id: "o2", label: "עצמאי", value: "self_employed", score: 7, nextNodeId: "q-income" },
      { id: "o3", label: "בעל עסק", value: "business_owner", score: 9, nextNodeId: "q-income" },
      { id: "o4", label: "פרישה", value: "retired", score: 3, nextNodeId: "q-income" },
    ],
    nextNodeId: null,
  }),
  n("q-income", "question", 1280, 0, {
    kind: "question",
    title: "מהו סדר הגודל של ההכנסה החודשית?",
    answerType: "single_choice",
    required: true,
    allowOther: false,
    combineAnswers: false,
    options: [
      { id: "o1", label: "עד 10,000 ₪", value: "under_10k", score: 2, nextNodeId: "q-priority" },
      { id: "o2", label: "10,000–20,000 ₪", value: "10_20k", score: 5, nextNodeId: "q-priority" },
      { id: "o3", label: "20,000–40,000 ₪", value: "20_40k", score: 8, nextNodeId: "q-priority" },
      { id: "o4", label: "מעל 40,000 ₪", value: "over_40k", score: 10, nextNodeId: "q-priority" },
    ],
    nextNodeId: null,
  }),
  n("q-priority", "question", 1600, 0, {
    kind: "question",
    title: "מה הכי חשוב לך כרגע?",
    answerType: "single_choice",
    required: true,
    allowOther: false,
    combineAnswers: false,
    options: [
      { id: "o1", label: "חיסכון לפנסיה", value: "pension", score: 6, nextNodeId: "lead-1" },
      { id: "o2", label: "השקעות", value: "investing", score: 8, nextNodeId: "lead-1" },
      { id: "o3", label: "צמצום הוצאות", value: "expenses", score: 3, nextNodeId: "lead-1" },
      { id: "o4", label: "תכנון ירושה", value: "inheritance", score: 7, nextNodeId: "lead-1" },
    ],
    nextNodeId: null,
  }),
  n("lead-1", "lead_details", 1920, 0, {
    kind: "lead_details",
    showName: true,
    showPhone: true,
    showEmail: true,
    requirePhoneIL: true,
    showConsent: true,
    consentText: "אני מאשר/ת קבלת מידע ופנייה טלפונית בנוגע לתוצאות הבדיקה.",
    nextNodeId: "end-1",
  }),
  n("end-1", "end", 2240, 0, {
    kind: "end",
    title: "תודה רבה!",
    text: "קיבלנו את הפרטים שלך, ניצור איתך קשר בהקדם עם תוצאות ההתאמה האישית שלך.",
    ctaLabel: "לקביעת פגישת ייעוץ",
    ctaUrl: "https://wa.me/972500000000",
  }),
];

const edges: QuizEdge[] = [
  { id: "e-start-msg", source: "start-1", sourceHandle: null, target: "msg-1" },
  { id: "e-msg-q1", source: "msg-1", sourceHandle: null, target: "q-age" },
  ...nodes
    .filter((nd) => nd.data.kind === "question")
    .flatMap((nd) =>
      (nd.data as Extract<QuizNode["data"], { kind: "question" }>).options.map((opt) => ({
        id: `e-${nd.id}-${opt.id}`,
        source: nd.id,
        sourceHandle: opt.id,
        target: opt.nextNodeId as string,
      }))
    ),
  { id: "e-lead-end", source: "lead-1", sourceHandle: null, target: "end-1" },
];

const FIRST_NAMES = ["דנה", "יוסי", "מיכל", "אורי", "שירה", "עידן", "נועה", "רועי", "טל", "ליאור", "אביגיל", "עומר", "הילה", "גיא", "רותם"];
const LAST_NAMES = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "דהן", "אזולאי", "שפירא", "רוזן"];
const UTM_SOURCES = ["facebook", "google", "instagram", "tiktok", "direct"];
const STATUSES = ["new", "in_progress", "meeting_scheduled", "closed", "not_relevant"] as const;

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function categoryFromScore(score: number): "hot" | "warm" | "cold" {
  if (score >= 26) return "hot";
  if (score >= 16) return "warm";
  return "cold";
}

export async function seedDemoQuiz(supabase: SupabaseClient, workspaceId: string) {
  const quiz = await createQuiz(supabase, workspaceId, {
    name: "בדיקת התאמה לתכנון פיננסי",
    description: "שאלון דמו לאיתור לידים חמים לייעוץ פיננסי",
  });

  await supabase.from("quizzes").update({ slug: "financial-fit" }).eq("id", quiz.id);
  await saveFlow(supabase, quiz.id, nodes, edges);
  await updateQuizTheme(supabase, quiz.id, THEME_PRESETS.solina_green);
  await updateQuizMeta(supabase, quiz.id, { status: "active" });

  const rand = seededRandom(42);
  const leadRows = Array.from({ length: 15 }, (_, i) => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const score = Math.round(8 + rand() * 30);
    const createdDaysAgo = Math.floor(rand() * 28);
    const createdAt = new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000).toISOString();
    return {
      workspace_id: workspaceId,
      quiz_id: quiz.id,
      name: `${first} ${last}`,
      phone: `05${Math.floor(10000000 + rand() * 89999999)}`,
      email: `${first}.${last}@example.co.il`.toLowerCase(),
      score,
      category: categoryFromScore(score),
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      utm_source: UTM_SOURCES[Math.floor(rand() * UTM_SOURCES.length)],
      utm_medium: "cpc",
      utm_campaign: "quizflow-demo",
      created_at: createdAt,
    };
  });

  await supabase.from("leads").insert(leadRows);

  return quiz;
}
