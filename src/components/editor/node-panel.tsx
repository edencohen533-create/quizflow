"use client";

import { Plus, Trash2, Copy, X } from "lucide-react";
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

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function NodePanel({
  node,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
}: {
  node: QuizNode;
  onChange: (data: QuizNodeData) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
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
          <MessageForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "question" && (
          <QuestionForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "name" && (
          <NameForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "lead_details" && (
          <LeadDetailsForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "condition" && (
          <ConditionForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "score" && (
          <ScoreForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "action" && (
          <ActionForm data={node.data} onChange={onChange} />
        )}
        {node.data.kind === "end" && (
          <EndForm data={node.data} onChange={onChange} />
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MessageForm({ data, onChange }: { data: MessageNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
      <Field label="כותרת">
        <Input value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <Field label="טקסט">
        <Textarea rows={4} value={data.text} onChange={(e) => onChange({ ...data, text: e.target.value })} />
      </Field>
      <Field label="קישור לתמונה (אופציונלי)">
        <Input value={data.imageUrl ?? ""} onChange={(e) => onChange({ ...data, imageUrl: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="קישור לוידאו (אופציונלי)">
        <Input value={data.videoUrl ?? ""} onChange={(e) => onChange({ ...data, videoUrl: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="טקסט כפתור המשך">
        <Input value={data.buttonLabel} onChange={(e) => onChange({ ...data, buttonLabel: e.target.value })} />
      </Field>
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

function QuestionForm({ data, onChange }: { data: QuestionNodeData; onChange: (d: QuizNodeData) => void }) {
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
      <Field label="כותרת השאלה">
        <Input value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <Field label="תיאור (אופציונלי)">
        <Textarea rows={2} value={data.description ?? ""} onChange={(e) => onChange({ ...data, description: e.target.value })} />
      </Field>
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
    </>
  );
}

function LeadDetailsForm({ data, onChange }: { data: LeadDetailsNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
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
        <div key={rule.id} className="rounded-lg border p-2 flex items-center gap-1.5 text-xs">
          <span className="flex-1">
            {rule.sourceField} {rule.operator} {rule.value}
          </span>
          <Button variant="ghost" size="icon" className="size-6 text-destructive" onClick={() => removeRule(rule.id)}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
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
  { value: "google_sheets", label: "הוספה ל-Google Sheets" },
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

function EndForm({ data, onChange }: { data: EndNodeData; onChange: (d: QuizNodeData) => void }) {
  return (
    <>
      <Field label="כותרת">
        <Input value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </Field>
      <Field label="טקסט סיום">
        <Textarea rows={3} value={data.text} onChange={(e) => onChange({ ...data, text: e.target.value })} />
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
