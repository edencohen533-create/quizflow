import { Quiz, QuizNode } from "./types";

export function findNode(quiz: Quiz, id: string | null | undefined): QuizNode | undefined {
  if (!id) return undefined;
  return quiz.nodes.find((n) => n.id === id);
}

export function getStartNode(quiz: Quiz): QuizNode | undefined {
  return quiz.nodes.find((n) => n.type === "start");
}

export function nextNodeFrom(quiz: Quiz, nodeId: string, handle: string | null = null): QuizNode | undefined {
  const edge = quiz.edges.find((e) => e.source === nodeId && (e.sourceHandle ?? null) === handle);
  if (edge) return findNode(quiz, edge.target);
  const source = findNode(quiz,nodeId);
  const direct = source?.data.kind === "question" && handle ? source.data.options.find(o=>o.id===handle)?.nextNodeId : source && "nextNodeId" in source.data ? source.data.nextNodeId : null;
  if(direct) return findNode(quiz,direct);
  const fallback = quiz.edges.find((e) => e.source === nodeId && e.sourceHandle == null);
  return fallback ? findNode(quiz, fallback.target) : undefined;
}

export function categoryFromScore(score: number, hotThreshold = 26, warmThreshold = 16): "hot" | "warm" | "cold" {
  if (score >= hotThreshold) return "hot";
  if (score >= warmThreshold) return "warm";
  return "cold";
}

export function isValidIsraeliPhone(phone: string): boolean {
  return /^0(5\d|[23489]|7[0-9])\d{7}$/.test(phone.replace(/[\s-]/g, ""));
}

const AUTO_ADVANCE_TYPES = new Set(["start", "condition", "ab_test", "score", "action"]);

export interface RuntimeContext { score?: number; utmSource?: string; answers?: Record<string,{answerLabel:string}>; sessionId?: string }
export function pickAbTestHandle(node: QuizNode, sessionId?: string): "a" | "b" {
  const split = node.data.kind === "ab_test" ? node.data.splitPercent : 50;
  let hash = 2166136261;
  for (const ch of (sessionId ?? "preview") + ":" + node.id) hash = Math.imul(hash ^ ch.charCodeAt(0),16777619) >>> 0;
  return (hash / 4294967296) * 100 < Math.max(0,Math.min(100,split)) ? "a" : "b";
}
export function conditionMatches(rule: import("./types").ConditionRule, context: RuntimeContext): boolean {
  const actual=rule.sourceField==="score" ? context.score ?? 0 : rule.sourceField==="utm_source" ? context.utmSource : context.answers?.[rule.answerNodeId ?? ""]?.answerLabel;
  if(actual===undefined) return false;
  if(rule.operator==="eq") return String(actual)===rule.value;
  if(String(actual).trim()==="" || rule.value.trim()==="") return false;
  const a=Number(actual),b=Number(rule.value);
  if(!Number.isFinite(a)||!Number.isFinite(b))return false;
  return rule.operator==="gt"?a>b:rule.operator==="gte"?a>=b:rule.operator==="lt"?a<b:a<=b;
}
export function resolveRenderable(quiz: Quiz, fromId: string, handle: string | null = null, context: RuntimeContext = {}): QuizNode | undefined {
  let node = nextNodeFrom(quiz, fromId, handle);
  const visited = new Set<string>();
  while (node && AUTO_ADVANCE_TYPES.has(node.type) && !visited.has(node.id)) {
    visited.add(node.id);
    if(node.data.kind==="condition"){
      const rule=node.data.rules.find(r=>conditionMatches(r,context));
      const target=rule?.targetNodeId ?? (rule ? undefined : node.data.elseNodeId);
      node=target ? findNode(quiz,target) : nextNodeFrom(quiz,node.id,rule?.id ?? "else");
    } else if(node.data.kind==="action"){
      // Redirects render an end card so saving/error/retry gates still apply.
      if(node.data.actionKind==="redirect") return {...node,type:"end",data:{kind:"end",title:"ממשיכים...",text:"",redirectEnabled:true,redirectUrl:node.data.redirectUrl,redirectDelaySeconds:0}};
      // Unsupported integrations must be rejected at publish, never silently skipped.
      return undefined;
    } else {
      const direct="nextNodeId" in node.data ? node.data.nextNodeId : null;
      node=direct ? findNode(quiz,direct) : nextNodeFrom(quiz,node.id,node.type==="ab_test"?pickAbTestHandle(node,context.sessionId):null);
    }
  }
  return node && !AUTO_ADVANCE_TYPES.has(node.type) ? node : undefined;
}
export function validatePublishableFlow(quiz: Quiz): string[] {
  const errors = new Set<string>();
  const start = getStartNode(quiz);
  if (!start) return ["חסר צומת התחלה"];
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(node: QuizNode | undefined) {
    if (!node) { errors.add("יש מסלול ללא המשך או חיבור לצומת חסר"); return; }
    if (visiting.has(node.id)) { errors.add("יש מסלול מעגלי שאינו מאפשר לסיים את השאלון"); return; }
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    const data = node.data;
    const targets: (QuizNode | undefined)[] = [];
    if (data.kind === "end") {
      // End cards are terminal even if stale editor edges remain.
    } else if (data.kind === "action") {
      if (data.actionKind !== "redirect") {
        errors.add("פעולת " + data.actionKind + " אינה מחוברת. הגדירו שליחה דרך אינטגרציות או טראקינג לפני הפרסום.");
      } else if (!/^https?:\/\//i.test(data.redirectUrl ?? "")) {
        errors.add("כתובת ההפניה אינה תקינה");
      }
    } else if (data.kind === "condition") {
      for (const rule of data.rules) {
        if (rule.sourceField === "answer" && !rule.answerNodeId) errors.add("יש לבחור שאלה בתנאי");
        targets.push(rule.targetNodeId ? findNode(quiz, rule.targetNodeId) : nextNodeFrom(quiz, node.id, rule.id));
      }
      targets.push(data.elseNodeId ? findNode(quiz, data.elseNodeId) : nextNodeFrom(quiz, node.id, "else"));
    } else if (data.kind === "ab_test") {
      for (const handle of ["a", "b"]) {
        if (!quiz.edges.some(edge => edge.source === node.id && edge.sourceHandle === handle)) errors.add("יש לחבר את שני מסלולי A/B");
        targets.push(nextNodeFrom(quiz, node.id, handle));
      }
    } else if (data.kind === "question" && (data.answerType === "single_choice" || data.answerType === "multi_choice")) {
      if (!data.options.length) errors.add("יש שאלה ללא אפשרויות בחירה");
      if (data.combineAnswers) targets.push(nextNodeFrom(quiz, node.id));
      else {
        for (const option of data.options) targets.push(nextNodeFrom(quiz, node.id, option.id));
        if (data.answerType === "multi_choice" && !data.required) targets.push(nextNodeFrom(quiz, node.id));
      }
    } else {
      // Automatic score nodes prioritize their configured direct continuation.
      targets.push(data.kind === "score" && data.nextNodeId ? findNode(quiz, data.nextNodeId) : nextNodeFrom(quiz, node.id));
    }
    for (const target of targets) visit(target);
    visiting.delete(node.id);
    visited.add(node.id);
  }
  visit(start);
  return [...errors];
}
