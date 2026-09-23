import type { QuestionAnswerType } from "./types";

// Shared by the runner and API so a locally accepted answer can be saved.
export function freeformAnswerError(value: string, type: QuestionAnswerType, required: boolean): string | null {
  const text = value.trim();
  const empty = !text || text === "—";
  if (!text && required) return "יש למלא תשובה כדי להמשיך";
  if (empty && !required) return null;
  if (type === "number" && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text)))) return "יש להזין מספר תקין";
  if (type === "rating" && (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 10)) return "יש לבחור דירוג בין 1 ל־10";
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith("0000-")) return "יש להזין תאריך תקין";
    const date = new Date(text + "T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) return "יש להזין תאריך תקין";
  }
  return null;
}
