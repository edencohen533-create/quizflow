import type { SupabaseClient } from "@supabase/supabase-js";
import { Quiz, QuizNode, QuizSessionAnswer } from "@/lib/types";
import { getStartNode, resolveRenderable } from "@/lib/quiz-runtime";
import { fetchQuizFull, listQuizzes } from "@/lib/supabase/queries";

const DEMO_IDENTITIES = [
  { name: "מאיה אלקבץ", phone: "0521234567", email: "maya.a@example.com" },
  { name: "רוני שגיא", phone: "0537654321", email: "roni.s@example.com" },
  { name: "עדי ברששת", phone: "0541122334", email: "adi.b@example.com" },
  { name: "טל הרוש", phone: "0559988776", email: "tal.h@example.com" },
  { name: "שירה נחמיאס", phone: "0501231234", email: "shira.n@example.com" },
  { name: "יובל קריספין", phone: "0524455667", email: "yuval.k@example.com" },
];
const DEMO_UTM_SOURCES = ["facebook", "instagram", "google", "direct"];
const RATING_VALUES = ["7", "8", "9", "10", "6"];
const FREE_TEXT_VALUES = ["בסדר גמור", "מעולה, תודה", "רוצה לדעת עוד פרטים", "לא בטוח/ה"];

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface WalkStep {
  node: QuizNode;
  handle: string | null;
  answer?: QuizSessionAnswer & { score: number };
}

// Mirrors the real public runtime's own resolveRenderable/branching logic,
// so a demo walk visits exactly the nodes a real visitor could visit.
function buildPath(quiz: Quiz): WalkStep[] {
  const steps: WalkStep[] = [];
  const start = getStartNode(quiz);
  if (!start) return steps;
  let current: QuizNode | undefined = resolveRenderable(quiz, start.id);
  let guard = 0;
  while (current && guard < 40) {
    guard++;
    if (current.type === "end") {
      steps.push({ node: current, handle: null });
      break;
    }
    if (current.data.kind === "message") {
      steps.push({ node: current, handle: null });
      current = resolveRenderable(quiz, current.id, null);
      continue;
    }
    if (current.data.kind === "question") {
      const q = current.data;
      if ((q.answerType === "single_choice" || q.answerType === "multi_choice") && q.options.length) {
        const opt = pickOne(q.options);
        steps.push({
          node: current,
          handle: opt.id,
          answer: { nodeId: current.id, questionTitle: q.title, answerLabel: opt.label, score: opt.score },
        });
        current = resolveRenderable(quiz, current.id, opt.id);
      } else {
        const label = q.answerType === "rating" ? pickOne(RATING_VALUES) : pickOne(FREE_TEXT_VALUES);
        steps.push({ node: current, handle: null, answer: { nodeId: current.id, questionTitle: q.title, answerLabel: label, score: 0 } });
        current = resolveRenderable(quiz, current.id, null);
      }
      continue;
    }
    if (current.data.kind === "lead_details") {
      steps.push({ node: current, handle: null });
      current = resolveRenderable(quiz, current.id, null);
      continue;
    }
    break;
  }
  return steps;
}

interface ActiveWalk {
  sessionId: string;
  quiz: Quiz;
  steps: WalkStep[];
  index: number;
  abandonAt: number | null;
  identity: (typeof DEMO_IDENTITIES)[number];
  utmSource: string;
  answers: QuizSessionAnswer[];
  score: number;
}

async function writeDemoStep(supabase: SupabaseClient, workspaceId: string, walk: ActiveWalk) {
  const step = walk.steps[walk.index];
  if (!step) return;
  if (step.answer) {
    walk.answers = [...walk.answers, { nodeId: step.answer.nodeId, questionTitle: step.answer.questionTitle, answerLabel: step.answer.answerLabel }];
    walk.score += step.answer.score;
  }
  const reachedLeadDetails = walk.steps.slice(0, walk.index + 1).some((s) => s.node.data.kind === "lead_details");
  const isEnd = step.node.type === "end";
  const category = walk.score >= 26 ? "hot" : walk.score >= 16 ? "warm" : "cold";
  const totalSteps = walk.quiz.nodes.filter((n) => n.type === "question" || n.type === "lead_details").length;
  const stepIndex = walk.steps.slice(0, walk.index + 1).filter((s) => s.node.type === "question" || s.node.type === "lead_details").length;

  let title = "";
  if (step.node.data.kind === "message") title = step.node.data.text || "הודעה";
  else if (step.node.data.kind === "question") title = step.node.data.title;
  else if (step.node.data.kind === "lead_details") title = "פרטי יצירת קשר";
  else if (step.node.data.kind === "end") title = "סיום";

  const now = new Date().toISOString();
  const { error } = await supabase.from("quiz_sessions").upsert({
    id: walk.sessionId,
    quiz_id: walk.quiz.id,
    workspace_id: workspaceId,
    quiz_name: walk.quiz.name,
    step_index: stepIndex,
    total_steps: totalSteps,
    current_node_id: step.node.id,
    current_node_title: title,
    status: isEnd ? "completed" : "active",
    name: reachedLeadDetails ? walk.identity.name : null,
    phone: reachedLeadDetails ? walk.identity.phone : null,
    email: reachedLeadDetails ? walk.identity.email : null,
    score: walk.score,
    category,
    utm_source: walk.utmSource,
    answers: walk.answers,
    is_demo: true,
    last_event_at: now,
    completed_at: isEnd ? now : null,
  });
  if (error) throw error;
}

export function startDemoSimulator(supabase: SupabaseClient, workspaceId: string): () => void {
  let stopped = false;
  const walks = new Map<string, ActiveWalk>();
  let quizzesCache: Quiz[] | null = null;

  async function getEligibleQuizzes(): Promise<Quiz[]> {
    if (quizzesCache) return quizzesCache;
    const all = await listQuizzes(supabase, workspaceId);
    const activeIds = all.filter((q) => q.status === "active").map((q) => q.id);
    const full = await Promise.all(activeIds.map((id) => fetchQuizFull(supabase, id)));
    quizzesCache = full.filter((q): q is Quiz => !!q && buildPath(q).length > 0);
    return quizzesCache;
  }

  async function startNewWalk() {
    const quizzes = await getEligibleQuizzes();
    if (!quizzes.length) return;
    const quiz = pickOne(quizzes);
    const steps = buildPath(quiz);
    if (!steps.length) return;
    const willAbandon = Math.random() < 0.45 && steps.length > 1;
    const abandonAt = willAbandon ? 1 + Math.floor(Math.random() * (steps.length - 1)) : null;
    const walk: ActiveWalk = {
      sessionId: `demo-${crypto.randomUUID()}`,
      quiz,
      steps,
      index: 0,
      abandonAt,
      identity: pickOne(DEMO_IDENTITIES),
      utmSource: pickOne(DEMO_UTM_SOURCES),
      answers: [],
      score: 0,
    };
    walks.set(walk.sessionId, walk);
    await writeDemoStep(supabase, workspaceId, walk);
  }

  async function advanceRandomWalk() {
    const inFlight = [...walks.values()].filter((w) => w.abandonAt === null || w.index < w.abandonAt);
    if (!inFlight.length) return;
    const walk = pickOne(inFlight);
    walk.index += 1;
    await writeDemoStep(supabase, workspaceId, walk);
    if (walk.steps[walk.index]?.node.type === "end") {
      walks.delete(walk.sessionId);
    }
  }

  async function tick() {
    if (stopped) return;
    try {
      if (walks.size < 5 && Math.random() < 0.5) {
        await startNewWalk();
      } else {
        await advanceRandomWalk();
      }
    } catch {
      // best-effort demo data; ignore transient failures
    }
    if (!stopped) {
      setTimeout(tick, 3500 + Math.random() * 3500);
    }
  }

  tick();

  return () => {
    stopped = true;
  };
}
