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
  const fallback = quiz.edges.find((e) => e.source === nodeId);
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

export function pickAbTestHandle(node: QuizNode): "a" | "b" {
  const splitPercent = node.data.kind === "ab_test" ? node.data.splitPercent : 50;
  return Math.random() * 100 < splitPercent ? "a" : "b";
}

export function resolveRenderable(quiz: Quiz, fromId: string, handle: string | null = null): QuizNode | undefined {
  let node = nextNodeFrom(quiz, fromId, handle);
  const visited = new Set<string>();
  while (node && AUTO_ADVANCE_TYPES.has(node.type) && !visited.has(node.id)) {
    visited.add(node.id);
    const nextHandle = node.type === "ab_test" ? pickAbTestHandle(node) : null;
    node = nextNodeFrom(quiz, node.id, nextHandle);
  }
  return node && !AUTO_ADVANCE_TYPES.has(node.type) ? node : undefined;
}
