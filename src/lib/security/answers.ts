import type { LeadAnswer, QuizNode } from "@/lib/types";
import { HttpError, isRecord, stringField } from "./http";

export function normalizeAnswers(input: unknown, nodes: QuizNode[]): LeadAnswer[] {
  if (!Array.isArray(input) || input.length > 200) throw new HttpError(400, "Invalid answers");
  const seen = new Set<string>();
  return input.map((answer) => {
    if (!isRecord(answer)) throw new HttpError(400, "Invalid answer");
    const nodeId = stringField(answer.nodeId, 128, true);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || seen.has(nodeId) || (node.data.kind !== "question" && node.data.kind !== "name")) throw new HttpError(400, "Invalid answer node");
    seen.add(nodeId);
    const data = node.data;
    let answerLabel = stringField(answer.answerLabel, 4000, data.required);
    let score = 0;
    let optionIds: string[] | undefined;
    if (data.kind === "question") {
      if (data.answerType === "single_choice" || data.answerType === "multi_choice") {
        if (!Array.isArray(answer.optionIds) || answer.optionIds.some((id) => typeof id !== "string")) throw new HttpError(400, "Invalid options");
        optionIds = answer.optionIds as string[];
        if (new Set(optionIds).size !== optionIds.length || optionIds.length > data.options.length ||
            (data.required && !optionIds.length) || (data.answerType === "single_choice" && optionIds.length !== 1)) throw new HttpError(400, "Invalid options");
        if (optionIds.some((id) => !data.options.some((option) => option.id === id))) throw new HttpError(400, "Unknown option");
        // Match the displayed label order, while preserving click order in optionIds
        // because the first selected option determines a branched continuation.
        const chosenIds = new Set(optionIds);
        const selected = data.options.filter((option) => chosenIds.has(option.id));
        answerLabel = selected.map((o) => o!.label).join(", ") || "—";
        score = selected.reduce((sum, o) => sum + o!.score, 0);
      } else if (data.answerType === "rating") {
        score = Number(answerLabel);
        if (!Number.isInteger(score) || score < 1 || score > 10) throw new HttpError(400, "Invalid rating");
      } else if (data.answerType === "number" && answerLabel !== "—" && !Number.isFinite(Number(answerLabel))) {
        throw new HttpError(400, "Invalid number");
      }
    }
    if (!Number.isSafeInteger(score) || Math.abs(score) > 100000) throw new HttpError(400, "Invalid score");
    return { nodeId, questionTitle: data.title, answerLabel, score, paramKey: data.paramKey, ...(optionIds ? { optionIds } : {}) };
  });
}
