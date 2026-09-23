"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, Copy, X, GripVertical, Bold, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AbTestNodeData,
  ActionKind,
  LeadDetailsNodeData,
  MessageNodeData,
  NameNodeData,
  QuestionAnswerType,
  QuestionNodeData,
  QuizNode,
  QuizNodeData,
  ScoreNodeData,
  EndNodeData,
  ActionNodeData,
  ConditionNodeData,
} from "@/lib/types";
import { NODE_META } from "@/components/editor/node-meta";
import { ImageUploadField } from "@/components/editor/image-upload-field";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function sanitizeParamKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function appendToken(current: string, token: string) {
  if (!current) return token;
  return current.endsWith(" ") || current.endsWith("\n") ? current + token : `${current} ${token}`;
}

type AvailableParam = { key: string; label: string };

// Lets a message/question/end block reference an answer captured earlier
// in the flow (e.g. {{name}}) — clicking a chip appends its token to the
// field; the live bot fills it in with the visitor's actual answer.
function ParamChips({ params, onInsert }: { params: AvailableParam[]; onInsert: (token: string) => void }) {
  if (params.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {params.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onInsert(`{{${p.key}}}`)}
          title={p.label}
          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {`{{${p.key}}}`}
        </button>
      ))}
    </div>
  );
}

type RichTextField = HTMLTextAreaElement | HTMLInputElement;

// Wraps or wraps-with-link the current selection in a text field with the
// same lightweight **bold**/[label](url) markup renderRichText() parses on
// the live bot, so nothing is bold unless the author explicitly marks it.
function RichTextToolbar({
  fieldRef,
  value,
  onChange,
}: {
  fieldRef: React.RefObject<RichTextField | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  function selection() {
    const el = fieldRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    return { start, end };
  }

  function toggleBold() {
    const { start, end } = selection();
    const selected = value.slice(start, end) || "טקסט מודגש";
    onChange(value.slice(0, start) + `**${selected}**` + value.slice(end));
  }

  function addLink() {
    const url = window.prompt("קישור (URL):", "https://");
    if (!url) return;
    const { start, end } = selection();
    const selected = value.slice(start, end) || "קישור";
    onChange(value.slice(0, start) + `[${selected}](${url})` + value.slice(end));
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="icon" className="size-6" onClick={toggleBold} title="הדגשת טקסט">
        <Bold className="size-3" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-6" onClick={addLink} title="הוסף קישור">
        <LinkIcon className="size-3" />
      </Button>
    </div>
  );
}

export function NodePanel({
  node,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
  availableParams,
}: {
  node: QuizNode;
  onChange: (data: QuizNodeData) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  availableParams: AvailableParam[];
}) {
  const meta = NODE_META[node.type];

  return (
    <aside className="w-80 shrink-0 border-s bg-card flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 h-14 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`flex size-6 items-center justify-center rounded-md ${meta.color}`}>
            <meta.icon className="size-3.5" />
          </span>
          <span className="font-semibold text-sm">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {node.type !== "start" && (
            <>
              <Button variant="ghost" size="icon" className="size-7" onClick={onDuplicate} title="שכפל">
                <Copy className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onDelete} title="מחק">
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.data.kind === "start" && (
          <p className="text-sm text-muted-foreground">זוהי נקודת ההתחלה של השאלון. לא ניתן לערוך או למחוק אותה.</p>
        )}
        {node.data.kind === "message" && (
          <MessageForm data={node.data} onChange={onChange} availableParams={availableParams} />
        )}
        {node.data.kind === "question" && (
          <QuestionForm data={node.data} onChange={onChange} availableParams={availableParams} />
        )}
        {node.data.kind === "name" && (
          <NameForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "lead_details" && (
          <LeadDetailsForm data={node.data} onChange={onChange} availableParams={availableParams} />
        )}
        {node.data.kind === "condition" && (
          <ConditionForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "ab_test" && (
          <AbTestForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "score" && (
          <ScoreForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "action" && (
          <ActionForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "end" && (
          <EndForm data={node.data} onChange={onChange} availableParams={availableParams} />
        )}
      </div>
    </aside>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

function MessageForm({ data, onChange, availableParams }: { data: MessageNodeData; onChange: (d: QuizNodeData) => void; availableParams: AvailableParam[] }) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <Field
        label="טקסט"
        action={<RichTextToolbar fieldRef={textRef} value={data.text} onChange={(v) => onChange({ ...data, text: v })} />}
      >
        <Textarea ref={textRef} rows={4} value={data.text} onChange={(e) => onChange({ ...data, text: e.target.value })} />
        <ParamChips params={availableParams} onInsert={(token) => onChange({ ...data, text: appendToken(data.text, token) })} />
      </Field>
      <Field label="תמונה (אופציונלי)">
        <ImageUploadField value={data.imageUrl ?? ""} onChange={(url) => onChange({ ...data, imageUrl: url })} autoTrim />
      </Field>
      <Field label="קישור לוידאו (אופציונלי)">
        <Input value={data.videoUrl ?? ""} onChange={(e) => onChange({ ...data, videoUrl: e.target.value })} placeholder="https://" />
      </Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">מעבר אוטומטי (בלי כפתור)</Label>
        <Switch checked={data.autoAdvance} onCheckedChange={(v) => onChange({ ...data, autoAdvance: v })} />
      </div>
      {data.autoAdvance ? (
        <Field label="להציג את ההודעה כמה שניות לפני שממשיכים">
          <Input
            type="number"
            min={1}
            value={data.autoAdvanceSeconds}
            onChange={(e) => onChange({ ...data, autoAdvanceSeconds: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
      ) : (
        <Field label="טקסט כפתור המשך">
          <Input value={data.buttonLabel} onChange={(e) => onChange({ ...data, buttonLabel: e.target.value })} />
        </Field>
      )}
    </>
  );
}

const ANSWER_TYPES: { value: QuestionAnswerType; label: string }[] = [
  { value: "single_choice", label: "בחירה יחידה" },
  { value: "multi_choice", label: "בחירה מרובה" },
  { value: "short_text", label: "טקסט קצר" },
  { value: "long_text", label: "טקסט ארוך" },
  { value: "number", label: "מספר" },
  { value: "rating", label: "דירוג 1–10" },
  { value: "date", label: "תאריך" },
];

function QuestionContentBlocks({ data, onChange, availableParams }: { data: QuestionNodeData; onChange: (d: QuizNodeData) => void; availableParams: AvailableParam[] }) {
  const imageFirst = data.imagePosition !== "below";
  const blocks: Array<"image" | "text"> = imageFirst ? ["image", "text"] : ["text", "image"];
  const [draggingBlock, setDraggingBlock] = useState<"image" | "text" | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  function handleDrop(target: "image" | "text") {
    if (draggingBlock && draggingBlock !== target) {
      onChange({ ...data, imagePosition: imageFirst ? "below" : "above" });
    }
    setDraggingBlock(null);
  }

  return (
    <div className="space-y-2">
      {blocks.map((block) => (
        <div
          key={block}
          draggable
          onDragStart={() => setDraggingBlock(block)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(block)}
          className="rounded-lg border border-dashed p-2 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 cursor-grab text-muted-foreground active:cursor-grabbing">
              <GripVertical className="size-3.5" />
              <span className="text-xs">{block === "image" ? "תמונה (אופציונלי)" : "השאלה"}</span>
            </div>
            {block === "text" && (
              <RichTextToolbar fieldRef={titleRef} value={data.title} onChange={(v) => onChange({ ...data, title: v })} />
            )}
          </div>
          {block === "image" ? (
            <ImageUploadField value={data.imageUrl ?? ""} onChange={(url) => onChange({ ...data, imageUrl: url })} autoTrim />
          ) : (
            <>
              <Textarea
                ref={titleRef}
                rows={5}
                value={data.title}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="מה השאלה?"
              />
              <ParamChips params={availableParams} onInsert={(token) => onChange({ ...data, title: appendToken(data.title, token) })} />
            </>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">גררו לפי הידית כדי לשנות את סדר התמונה ביחס לשאלה.</p>
    </div>
  );
}

function QuestionForm({ data, onChange, availableParams }: { data: QuestionNodeData; onChange: (d: QuizNodeData) => void; availableParams: AvailableParam[] }) {
  const isChoice = data.answerType === "single_choice" || data.answerType === "multi_choice";

  function updateOption(id: string, patch: Partial<QuestionNodeData["options"][number]>) {
    onChange({ ...data, options: data.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }
  function addOption() {
    onChange({
      ...data,
      options: [...data.options, { id: uid(), label: "אפשרות חדשה", value: `opt_${uid()}`, score: 0, nextNodeId: null }],
    });
  }
  function removeOption(id: string) {
    onChange({ ...data, options: data.options.filter((o) => o.id !== id) });
  }

  return (
    <>
      <QuestionContentBlocks data={data} onChange={onChange} availableParams={availableParams} />
      <Field label="סוג תשובה">
        <Select
          value={data.answerType}
          onValueChange={(v) => onChange({ ...data, answerType: v as QuestionAnswerType })}
          items={Object.fromEntries(ANSWER_TYPES.map((t) => [t.value, t.label]))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANSWER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">שדה חובה</Label>
        <Switch checked={data.required} onCheckedChange={(v) => onChange({ ...data, required: v })} />
      </div>
      {isChoice && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">אפשר &quot;תשובה אחרת&quot;</Label>
          <Switch checked={data.allowOther} onCheckedChange={(v) => onChange({ ...data, allowOther: v })} />
        </div>
      )}
      {isChoice && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">כל התשובות ממשיכות לאותו מקום</Label>
          <Switch checked={data.combineAnswers} onCheckedChange={(v) => onChange({ ...data, combineAnswers: v })} />
        </div>
      )}
      {isChoice && data.combineAnswers && (
        <p className="text-xs text-muted-foreground -mt-2">
          יופיע חיבור יוצא אחד בלבד לצומת, במקום חיבור נפרד לכל אפשרות.
        </p>
      )}
      <Field label="מפתח לשליחה ב-Webhook (אופציונלי)">
        <Input
          dir="ltr"
          value={data.paramKey ?? ""}
          onChange={(e) => onChange({ ...data, paramKey: sanitizeParamKey(e.target.value) })}
          placeholder="age"
        />
        <p className="text-xs text-muted-foreground">
          המפתח (key) שתחתיו התשובה לשאלה הזו תישלח ב-webhook. ריק = לפי מזהה הצומת.
        </p>
      </Field>
      {isChoice && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">אפשרויות תשובה</Label>
          <div className="space-y-2">
            {data.options.map((opt) => (
              <div key={opt.id} className="rounded-lg border p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={opt.label}
                    onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                    className="h-7 text-xs"
                  />
                  <Button variant="ghost" size="icon" className="size-7 shrink-0 text-destructive" onClick={() => removeOption(opt.id)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  ניקוד:
                  <Input
                    type="number"
                    value={opt.score}
                    onChange={(e) => updateOption(opt.id, { score: Number(e.target.value) })}
                    className="h-6 w-16 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={addOption}>
            <Plus className="size-3.5" /> הוסף אפשרות
          </Button>
        </div>
      )}
    </>
  );
}

function NameForm({ data, onChange }: { data: NameNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
      <Field label="שאלת השם">
        <Input value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <Field label="טקסט מציין מקום (placeholder)">
        <Input value={data.placeholder ?? ""} onChange={(e) => onChange({ ...data, placeholder: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">שדה חובה</Label>
        <Switch checked={data.required} onCheckedChange={(v) => onChange({ ...data, required: v })} />
      </div>
      <Field label="מפתח לשליחה ב-Webhook (אופציונלי)">
        <Input
          dir="ltr"
          value={data.paramKey ?? ""}
          onChange={(e) => onChange({ ...data, paramKey: sanitizeParamKey(e.target.value) })}
          placeholder="full_name"
        />
        <p className="text-xs text-muted-foreground">
          המפתח (key) שתחתיו התשובה הזו תישלח ב-webhook. ריק = לפי מזהה הצומת.
        </p>
      </Field>
    </>
  );
}

function LeadDetailsForm({ data, onChange, availableParams }: { data: LeadDetailsNodeData; onChange: (d: QuizNodeData) => void; availableParams: AvailableParam[] }) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <Field
        label="טקסט"
        action={<RichTextToolbar fieldRef={titleRef} value={data.title ?? ""} onChange={(v) => onChange({ ...data, title: v })} />}
      >
        <Textarea
          ref={titleRef}
          rows={2}
          value={data.title ?? ""}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="השאירו פרטים ונחזור אליכם"
        />
        <ParamChips params={availableParams} onInsert={(token) => onChange({ ...data, title: appendToken(data.title ?? "", token) })} />
      </Field>
      <Field label="טקסט כפתור השליחה">
        <Input aria-label="טקסט כפתור השליחה" value={data.buttonLabel ?? ""} onChange={(event) => onChange({ ...data, buttonLabel: event.target.value })} placeholder="שליחה" />
      </Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">כתובת מייל חובה</Label>
        <Switch checked={!!data.requireEmail} onCheckedChange={(value) => onChange({ ...data, requireEmail: value })} />
      </div>
      {[
        { key: "showName" as const, label: "הצג שם מלא" },
        { key: "showPhone" as const, label: "הצג טלפון" },
        { key: "showEmail" as const, label: "הצג אימייל" },
      ].map((f) => (
        <div key={f.key} className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{f.label}</Label>
          <Switch checked={data[f.key]} onCheckedChange={(v) => onChange({ ...data, [f.key]: v })} />
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">ולידציה לטלפון ישראלי</Label>
        <Switch checked={data.requirePhoneIL} onCheckedChange={(v) => onChange({ ...data, requirePhoneIL: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">הסכמה לדיוור / תנאי פרטיות</Label>
        <Switch checked={data.showConsent} onCheckedChange={(v) => onChange({ ...data, showConsent: v })} />
      </div>
      {data.showConsent && (
        <Field label="טקסט ההסכמה">
          <Textarea rows={2} value={data.consentText} onChange={(e) => onChange({ ...data, consentText: e.target.value })} />
        </Field>
      )}
    </>
  );
}

function AbTestForm({ data, onChange }: { data: AbTestNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        חבר את שני הפלטים (וריאנט A ווריאנט B) מהצומת בקנבס לשני בלוקים שונים כדי לבדוק איזה ניסוח עובד טוב יותר. כל משתמש מוצא אקראית לוריאנט אחד, לפי האחוז שתגדיר כאן.
      </p>
      <Field label="אחוז תנועה לוריאנט A">
        <Input
          type="number"
          min={0}
          max={100}
          value={data.splitPercent}
          onChange={(e) => onChange({ ...data, splitPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        וריאנט A: {data.splitPercent}% · וריאנט B: {100 - data.splitPercent}%
      </p>
    </>
  );
}

function ConditionForm({ data, onChange }: { data: ConditionNodeData; onChange: (d: QuizNodeData) => void }) {
  function addRule() {
    onChange({
      ...data,
      rules: [...data.rules, { id: uid(), sourceField: "score", operator: "gt", value: "7", targetNodeId: null }],
    });
  }
  function removeRule(id: string) {
    onChange({ ...data, rules: data.rules.filter((r) => r.id !== id) });
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">
        הגדר תנאים לבדיקה. יעד המסלול נקבע ע&quot;י חיבור בין הצומת לצמתים הבאים בקנבס.
      </p>
      {data.rules.map((rule) => (
        <div key={rule.id} className="rounded-lg border p-2 space-y-2 text-xs">
          <label>שדה<select className="w-full border rounded p-1" value={rule.sourceField} onChange={e=>onChange({...data,rules:data.rules.map(r=>r.id===rule.id?{...r,sourceField:e.target.value as "score"|"utm_source"|"answer"}:r)})}><option value="score">ניקוד</option><option value="utm_source">מקור תנועה</option><option value="answer">תשובה לשאלה</option></select></label>
          {rule.sourceField==="answer"&&<Input aria-label="מזהה שאלה בתנאי" placeholder="מזהה הצומת של השאלה" value={rule.answerNodeId??""} onChange={e=>onChange({...data,rules:data.rules.map(r=>r.id===rule.id?{...r,answerNodeId:e.target.value}:r)})}/>}
          <label>השוואה<select className="w-full border rounded p-1" value={rule.operator} onChange={e=>onChange({...data,rules:data.rules.map(r=>r.id===rule.id?{...r,operator:e.target.value as typeof r.operator}:r)})}>{["eq","gt","gte","lt","lte"].map(op=><option key={op} value={op}>{op}</option>)}</select></label>
          <Input aria-label="ערך התנאי" value={rule.value} onChange={e=>onChange({...data,rules:data.rules.map(r=>r.id===rule.id?{...r,value:e.target.value}:r)})}/>
          <Input aria-label="יעד התנאי" placeholder="מזהה צומת היעד" value={rule.targetNodeId??""} onChange={e=>onChange({...data,rules:data.rules.map(r=>r.id===rule.id?{...r,targetNodeId:e.target.value||null}:r)})}/>
          <Button variant="ghost" size="sm" onClick={() => removeRule(rule.id)}>מחיקת תנאי</Button>
        </div>
      ))}
      <Field label="יעד כשאין התאמה"><Input placeholder="מזהה צומת ברירת המחדל" value={data.elseNodeId??""} onChange={e=>onChange({...data,elseNodeId:e.target.value||null})}/></Field>
      <Button variant="outline" size="sm" className="w-full" onClick={addRule}>
        <Plus className="size-3.5" /> הוסף תנאי
      </Button>
    </>
  );
}

function ScoreForm({ data, onChange }: { data: ScoreNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
      <Field label="סף לקטגוריית חם">
        <Input type="number" value={data.hotThreshold} onChange={(e) => onChange({ ...data, hotThreshold: Number(e.target.value) })} />
      </Field>
      <Field label="סף לקטגוריית בינוני">
        <Input type="number" value={data.warmThreshold} onChange={(e) => onChange({ ...data, warmThreshold: Number(e.target.value) })} />
      </Field>
    </>
  );
}

const ACTION_KINDS: { value: ActionKind; label: string }[] = [
  { value: "webhook", label: "שליחת Webhook" },
  { value: "crm", label: "יצירת ליד ב-CRM" },
  { value: "email", label: "שליחת אימייל" },
  { value: "redirect", label: "Redirect לכתובת URL" },
  { value: "meta_pixel", label: "Meta Pixel Event" },
  { value: "tiktok_pixel", label: "TikTok Pixel Event" },
];

function ActionForm({ data, onChange }: { data: ActionNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
      <Field label="סוג פעולה">
        <Select
          value={data.actionKind}
          onValueChange={(v) => onChange({ ...data, actionKind: v as ActionKind })}
          items={Object.fromEntries(ACTION_KINDS.map((a) => [a.value, a.label]))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTION_KINDS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {data.actionKind === "webhook" && (
        <Field label="כתובת Webhook">
          <Input value={data.webhookUrl ?? ""} onChange={(e) => onChange({ ...data, webhookUrl: e.target.value })} placeholder="https://" />
        </Field>
      )}
      {data.actionKind === "redirect" && (
        <Field label="כתובת יעד">
          <Input value={data.redirectUrl ?? ""} onChange={(e) => onChange({ ...data, redirectUrl: e.target.value })} placeholder="https://" />
        </Field>
      )}
    </>
  );
}

function EndForm({ data, onChange, availableParams }: { data: EndNodeData; onChange: (d: QuizNodeData) => void; availableParams: AvailableParam[] }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <Field
        label="כותרת"
        action={<RichTextToolbar fieldRef={titleRef} value={data.title} onChange={(v) => onChange({ ...data, title: v })} />}
      >
        <Input ref={titleRef} value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <Field
        label="טקסט סיום"
        action={<RichTextToolbar fieldRef={textRef} value={data.text} onChange={(v) => onChange({ ...data, text: v })} />}
      >
        <Textarea ref={textRef} rows={3} value={data.text} onChange={(e) => onChange({ ...data, text: e.target.value })} />
        <ParamChips params={availableParams} onInsert={(token) => onChange({ ...data, text: appendToken(data.text, token) })} />
      </Field>
      <Field label="טקסט כפתור CTA (אופציונלי)">
        <Input value={data.ctaLabel ?? ""} onChange={(e) => onChange({ ...data, ctaLabel: e.target.value })} />
      </Field>
      <Field label="קישור CTA">
        <Input value={data.ctaUrl ?? ""} onChange={(e) => onChange({ ...data, ctaUrl: e.target.value })} placeholder="https://" />
      </Field>
      <div className="flex items-center justify-between pt-2 border-t">
        <Label className="text-xs text-muted-foreground">הפניה אוטומטית לאתר בסיום</Label>
        <Switch
          checked={data.redirectEnabled ?? false}
          onCheckedChange={(v) => onChange({ ...data, redirectEnabled: v })}
        />
      </div>
      {data.redirectEnabled && (
        <>
          <Field label="כתובת ההפניה">
            <Input
              value={data.redirectUrl ?? ""}
              onChange={(e) => onChange({ ...data, redirectUrl: e.target.value })}
              placeholder="https://"
              dir="ltr"
            />
          </Field>
          <Field label="השהיה לפני ההפניה (שניות)">
            <Input
              type="number"
              min={0}
              value={data.redirectDelaySeconds ?? 3}
              onChange={(e) => onChange({ ...data, redirectDelaySeconds: Number(e.target.value) || 0 })}
            />
          </Field>
        </>
      )}
    </>
  );
}
