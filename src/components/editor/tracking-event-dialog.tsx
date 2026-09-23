"use client";

import { toast } from "sonner";
import { TIKTOK_EVENT_NAME } from "@/lib/tiktok-pixel";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuizNode, QuizTrackingEvent, TrackingCondition, TRACKING_EVENT_LABELS, TrackingEventName } from "@/lib/types";
import { TrackingEventInput } from "@/lib/supabase/tracking-queries";

const EVENT_NAMES: TrackingEventName[] = ["PageView", "Lead", "ViewContent", "InitiateCheckout", "Purchase", "CompleteRegistration", "Custom"];

function triggerOptions(nodes: QuizNode[]) {
  const questionOptions = nodes
    .filter((n) => n.type === "question")
    .map((n) => ({ value: n.id, label: "לאחר תשובה: " + (n.data.kind === "question" ? n.data.title : n.id) }));
  return [
    { value: "__page_load__", label: "בטעינת השאלון" },
    { value: "__lead_details__", label: "לאחר השארת פרטים" },
    { value: "__end__", label: "בסיום השאלון (אחרי שמירה)" },
    { value: "__saved__", label: "לאחר שמירה מוצלחת של הפרטים" },
    ...questionOptions,
  ];
}

export function TrackingEventDialog({
  open,
  onOpenChange,
  nodes,
  initial,
  onSave,
  defaultTarget = "meta",
}: {
  defaultTarget?: "meta" | "tiktok";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: QuizNode[];
  initial?: QuizTrackingEvent;
  onSave: (input: TrackingEventInput) => Promise<void>;
}) {
  const options = triggerOptions(nodes);
  const [name, setName] = useState<TrackingEventName>(initial?.name ?? "Lead");
  const [customName, setCustomName] = useState(initial?.customName ?? "");
  const [triggerNodeId, setTriggerNodeId] = useState(initial ? initial.triggerNodeId ?? "__page_load__" : defaultTarget === "tiktok" ? "__saved__" : "__page_load__");
  const [sendToPixel, setSendToPixel] = useState(initial?.sendToPixel ?? defaultTarget === "meta");
  const [sendToCapi, setSendToCapi] = useState(initial?.sendToCapi ?? defaultTarget === "meta");
  const [sendToTikTok, setSendToTikTok] = useState(initial?.sendToTikTok ?? defaultTarget === "tiktok");
  const [sendToGtm, setSendToGtm] = useState(initial?.sendToGtm ?? false);
  const [sendToCustomCode, setSendToCustomCode] = useState(initial?.sendToCustomCode ?? false);
  const [customCode, setCustomCode] = useState(initial?.customCode ?? "");
  const [value, setValue] = useState(initial?.value?.toString() ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "ILS");
  const [conditionField, setConditionField] = useState(initial?.condition?.field ?? "");
  const [conditionOperator, setConditionOperator] = useState<TrackingCondition["operator"]>(initial?.condition?.operator ?? "eq");
  const [conditionValue, setConditionValue] = useState(initial?.condition?.value ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    if (!sendToPixel && !sendToCapi && !sendToTikTok && !sendToGtm && !sendToCustomCode) { toast.error("יש לבחור לפחות יעד אחד"); return; }
    if (name === "Custom" && !customName.trim()) { toast.error("יש להזין שם אירוע"); return; }
    if (sendToTikTok && name === "Custom" && !TIKTOK_EVENT_NAME.test(customName.trim())) { toast.error("שם אירוע TikTok: עד 50 תווים, מתחיל באות באנגלית, עם אותיות, ספרות, מקף או קו תחתון"); return; }
    if (sendToCapi && name === "Custom" && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(customName.trim())) { toast.error("שם אירוע Meta CAPI חייב להתחיל באות באנגלית ולהכיל רק אותיות, ספרות וקו תחתון"); return; }
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) { toast.error("יש להזין ערך כספי תקין"); return; }
    if (value && !/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) { toast.error("יש להזין קוד מטבע בן שלוש אותיות"); return; }
    setSaving(true);
    try { await onSave({
      name,
      customName: name === "Custom" ? customName.trim() : undefined,
      triggerNodeId: triggerNodeId === "__page_load__" ? null : triggerNodeId,
      sendToPixel,
      sendToTikTok,
      sendToCapi,
      sendToGtm,
      sendToCustomCode,
      customCode: sendToCustomCode ? customCode : undefined,
      value: value ? Number(value) : null,
      currency: currency.trim().toUpperCase(),
      condition: conditionField.trim() && conditionValue !== "" ? { field: conditionField.trim(), operator: conditionOperator, value: conditionValue } : null,
      enabled,
    });
    onOpenChange(false);
    } catch { toast.error("שמירת האירוע נכשלה. אפשר לנסות שוב."); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "עריכת אירוע" : "אירוע המרה חדש"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pe-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">שם האירוע</Label>
              <Select value={name} onValueChange={(v) => v && setName(v as TrackingEventName)} items={TRACKING_EVENT_LABELS}>
                <SelectTrigger aria-label="שם האירוע"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_NAMES.map((n) => <SelectItem key={n} value={n}>{TRACKING_EVENT_LABELS[n]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">צעד מפעיל</Label>
              <Select
                value={triggerNodeId ?? "__page_load__"}
                onValueChange={(v) => v && setTriggerNodeId(v)}
                items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
              >
                <SelectTrigger aria-label="צעד מפעיל"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {name === "Custom" && (
            <div className="space-y-1.5">
              <Label className="text-xs">שם אירוע מותאם</Label>
              <Input aria-label="שם אירוע מותאם" value={customName} onChange={(e) => setCustomName(e.target.value)} dir="ltr" placeholder="MyCustomEvent" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">תנאי אופציונלי (רק אם נבחרה תשובה מסוימת)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="שדה התנאי" value={conditionField} onChange={(e) => setConditionField(e.target.value)} placeholder="שדה, לדוגמה: q-priority" dir="ltr" className="text-xs" />
              <Input aria-label="ערך התנאי" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} placeholder="ערך מצופה" className="text-xs" />
            </div>
          </div>

          <select aria-label="סוג התנאי" value={conditionOperator} onChange={event => setConditionOperator(event.target.value as TrackingCondition["operator"])} className="rounded border p-2 text-sm">
            <option value="eq">שווה</option><option value="neq">לא שווה</option><option value="gt">גדול מ־</option><option value="gte">גדול או שווה</option><option value="lt">קטן מ־</option><option value="lte">קטן או שווה</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ערך כספי (אופציונלי)</Label>
              <Input aria-label="ערך כספי" type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">מטבע</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} dir="ltr" />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span>TikTok Pixel (דפדפן)</span>
              <Switch aria-label="TikTok Pixel" checked={sendToTikTok} onCheckedChange={setSendToTikTok} />
            </div>
            <p className="text-xs font-medium text-muted-foreground">פלטפורמות יעד</p>
            <div className="flex items-center justify-between text-sm">
              <span>Meta Pixel (דפדפן)</span>
              <Switch aria-label="Meta Pixel" checked={sendToPixel} onCheckedChange={setSendToPixel} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Meta Conversions API (שרת)</span>
              <Switch aria-label="Meta CAPI" checked={sendToCapi} onCheckedChange={setSendToCapi} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Google Tag Manager</span>
              <Switch checked={sendToGtm} onCheckedChange={setSendToGtm} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>בלוק קוד מותאם אישית (JS)</span>
              <Switch checked={sendToCustomCode} onCheckedChange={setSendToCustomCode} />
            </div>
            {sendToCustomCode && (
              <textarea
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                dir="ltr"
                rows={4}
                placeholder={"window.fbq('track', 'Contact');"}
                className="w-full rounded-md border bg-background px-2.5 py-2 text-xs font-mono outline-none focus:ring-2"
              />
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">האירוע פעיל</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving}>{initial ? "שמור שינויים" : "הוסף אירוע"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
