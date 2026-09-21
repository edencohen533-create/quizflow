import { Handle, NodeProps, Position } from "reactflow";
import { BaseNode } from "./base-node";
import {
  AbTestNodeData,
  ActionNodeData,
  ConditionNodeData,
  EndNodeData,
  LeadDetailsNodeData,
  MessageNodeData,
  NameNodeData,
  QuestionNodeData,
  ScoreNodeData,
} from "@/lib/types";

type WithConnected<T> = T & { _connected?: boolean };

export function StartNodeRenderer({ selected, data }: NodeProps<WithConnected<Record<string, never>>>) {
  return (
    <BaseNode type="start" title="התחלה" selected={selected} showTarget={false} connected={data._connected ?? true}>
      נקודת הכניסה לזרימה
    </BaseNode>
  );
}

export function MessageNodeRenderer({ selected, data }: NodeProps<WithConnected<MessageNodeData>>) {
  return (
    <BaseNode type="message" title={data.title || "הודעה"} selected={selected} connected={data._connected}>
      <p className="line-clamp-2">{data.text || "ללא טקסט"}</p>
      {data.autoAdvance && <p className="mt-1 text-[11px] opacity-70">מעבר אוטומטי אחרי {data.autoAdvanceSeconds} שנ&apos;</p>}
    </BaseNode>
  );
}

export function QuestionNodeRenderer({ selected, data }: NodeProps<WithConnected<QuestionNodeData>>) {
  const isChoice = data.answerType === "single_choice" || data.answerType === "multi_choice";
  const combined = isChoice && data.combineAnswers;
  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !bg-muted-foreground/50 !border-2 !border-card" />
      <div className="relative flex items-center gap-2 border-b px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-md text-violet-600 bg-violet-500/10">?</span>
        <span className="text-xs font-semibold flex-1 truncate">{data.title || "שאלה חדשה"}</span>
        {!data._connected && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />}
        {combined && (
          <Handle
            type="source"
            position={Position.Right}
            style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: -8 }}
            className="!size-2.5 !bg-primary !border-2 !border-card"
          />
        )}
      </div>
      <div className="py-1.5">
        {isChoice ? (
          data.options.map((opt) => (
            <div key={opt.id} className="relative flex items-center justify-between px-3 py-1.5 text-xs hover:bg-accent/50">
              <span className="truncate">{opt.label || "אפשרות"}</span>
              {!combined && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={opt.id}
                  style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: -8 }}
                  className="!size-2.5 !bg-primary !border-2 !border-card"
                />
              )}
            </div>
          ))
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            תשובה חופשית ({ANSWER_TYPE_LABEL[data.answerType]})
            <Handle type="source" position={Position.Right} className="!size-2.5 !bg-primary !border-2 !border-card" />
          </div>
        )}
      </div>
    </div>
  );
}

const ANSWER_TYPE_LABEL: Record<QuestionNodeData["answerType"], string> = {
  single_choice: "בחירה יחידה",
  multi_choice: "בחירה מרובה",
  short_text: "טקסט קצר",
  long_text: "טקסט ארוך",
  number: "מספר",
  rating: "דירוג 1–10",
  date: "תאריך",
};

export function NameNodeRenderer({ selected, data }: NodeProps<WithConnected<NameNodeData>>) {
  return (
    <BaseNode type="name" title={data.title || "שם"} selected={selected} connected={data._connected}>
      {data.placeholder || "השם שלך"}
    </BaseNode>
  );
}

export function LeadDetailsNodeRenderer({ selected, data }: NodeProps<WithConnected<LeadDetailsNodeData>>) {
  const fields = [
    data.showName && "שם",
    data.showPhone && "טלפון",
    data.showEmail && "אימייל",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <BaseNode type="lead_details" title="שדה פרטים" selected={selected} connected={data._connected}>
      {fields || "לא נבחרו שדות"}
    </BaseNode>
  );
}

export function AbTestNodeRenderer({ selected, data }: NodeProps<WithConnected<AbTestNodeData>>) {
  const branches: { id: "a" | "b"; label: string; percent: number }[] = [
    { id: "a", label: "וריאנט A", percent: data.splitPercent },
    { id: "b", label: "וריאנט B", percent: 100 - data.splitPercent },
  ];
  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !bg-muted-foreground/50 !border-2 !border-card" />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-md text-[10px] font-bold text-cyan-600 bg-cyan-500/10">
          A/B
        </span>
        <span className="text-xs font-semibold flex-1 truncate">בדיקת A/B</span>
        {!data._connected && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />}
      </div>
      <div className="py-1.5">
        {branches.map((b) => (
          <div key={b.id} className="relative flex items-center justify-between px-3 py-1.5 text-xs hover:bg-accent/50">
            <span className="truncate">{b.label} · {b.percent}%</span>
            <Handle
              type="source"
              position={Position.Right}
              id={b.id}
              style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: -8 }}
              className="!size-2.5 !bg-primary !border-2 !border-card"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConditionNodeRenderer({ selected, data }: NodeProps<WithConnected<ConditionNodeData>>) {
  return (
    <BaseNode type="condition" title="תנאי" selected={selected} connected={data._connected}>
      {data.rules.length} כללים מוגדרים
    </BaseNode>
  );
}

export function ScoreNodeRenderer({ selected, data }: NodeProps<WithConnected<ScoreNodeData>>) {
  return (
    <BaseNode type="score" title="חישוב ניקוד" selected={selected} connected={data._connected}>
      חם ≥ {data.hotThreshold} · בינוני ≥ {data.warmThreshold}
    </BaseNode>
  );
}

const ACTION_LABEL: Record<ActionNodeData["actionKind"], string> = {
  webhook: "שליחת Webhook",
  crm: "יצירת ליד ב-CRM",
  email: "שליחת אימייל",
  redirect: "Redirect לכתובת URL",
  meta_pixel: "Meta Pixel Event",
  tiktok_pixel: "TikTok Pixel Event",
};

export function ActionNodeRenderer({ selected, data }: NodeProps<WithConnected<ActionNodeData>>) {
  return (
    <BaseNode type="action" title="פעולה" selected={selected} connected={data._connected}>
      {ACTION_LABEL[data.actionKind]}
    </BaseNode>
  );
}

export function EndNodeRenderer({ selected, data }: NodeProps<WithConnected<EndNodeData>>) {
  return (
    <BaseNode type="end" title={data.title || "סיום"} selected={selected} showSource={false} connected={data._connected}>
      <p className="line-clamp-2">{data.text}</p>
    </BaseNode>
  );
}

export const nodeTypes = {
  start: StartNodeRenderer,
  message: MessageNodeRenderer,
  question: QuestionNodeRenderer,
  name: NameNodeRenderer,
  lead_details: LeadDetailsNodeRenderer,
  condition: ConditionNodeRenderer,
  ab_test: AbTestNodeRenderer,
  score: ScoreNodeRenderer,
  action: ActionNodeRenderer,
  end: EndNodeRenderer,
};
