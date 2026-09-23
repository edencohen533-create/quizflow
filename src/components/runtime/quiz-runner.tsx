"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getImageProps } from "next/image";
import { isStoredQuizImage } from "@/lib/quiz-images";
import { ChevronDown, ArrowLeft } from "lucide-react";
import { Quiz, QuizNode, QuizTheme, LeadAnswer } from "@/lib/types";
import { getStartNode, resolveRenderable, isValidIsraeliPhone } from "@/lib/quiz-runtime";
import { createClient } from "@/lib/supabase/client";
import { recordAnalyticsEvent, submitPublicQuizResponse } from "@/lib/supabase/queries";
import { triggerIntegrations } from "@/lib/integrations";
import { getTrackingSettings, listTrackingEvents } from "@/lib/supabase/tracking-queries";
import { fireTrackingEvent } from "@/lib/tracking-runtime";
import { QuizTrackingEvent, QuizTrackingSettings, QuizSessionAnswer } from "@/lib/types";
import { SunAvatar } from "@/components/runtime/sun-avatar";
import { renderRichText } from "@/lib/rich-text";
import type { PublicSession } from "@/lib/public-session";
import { safeLink } from "@/lib/safe-content";
import { FONT_FAMILY_CSS } from "@/lib/quiz-fonts";

const Checkbox = dynamic(() => import("@/components/ui/checkbox").then((m) => m.Checkbox));

type Palette = ReturnType<typeof buildPalette>;

function buildPalette(theme: QuizTheme) {
  const accent = theme.primaryColor || "#EE746C";
  return {
    page: theme.backgroundColor || "#F7F6EC",
    bubbleBot: "#FFFFFF",
    bubbleUser: "#F1EFF2",
    buttonBorder: theme.buttonBorderColor || accent,
    buttonText: theme.buttonTextColor || accent,
    text: theme.textColor || "#535C82",
    muted: theme.mutedTextColor || "#9AA0BE",
    radius: theme.cornerRadius ?? 22,
    fontFamily: FONT_FAMILY_CSS[theme.fontFamily] ?? FONT_FAMILY_CSS.assistant,
    fontSize: theme.fontSize ?? 16,
  };
}

function backgroundValue(imageUrl: string | undefined, fallbackColor: string) {
  return imageUrl ? `url(${JSON.stringify(imageUrl)}) center/cover no-repeat` : fallbackColor;
}

// Replaces {{key}} tokens in bot text with a previously captured answer,
// looked up by the question/name block's own param key (or by "name"/
// "phone"/"email" for the built-in lead-details fields).
function interpolateParams(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );
}

function Avatar({ url, size = 34 }: { url?: string; size?: number }) {
  if (url) {
    const imageProps = isStoredQuizImage(url)
      ? getImageProps({ src: url, width: size, height: size, alt: "", loading: "eager" }).props
      : { src: url, alt: "", width: size, height: size };
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...imageProps}
        alt=""
        className="shrink-0 rounded-full bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return <SunAvatar size={size} />;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function titleForNode(node: QuizNode): string {
  switch (node.data.kind) {
    case "message":
      return node.data.text || "הודעה";
    case "question":
      return node.data.title;
    case "name":
      return node.data.title;
    case "lead_details":
      return "פרטי יצירת קשר";
    case "end":
      return "סיום";
    default:
      return "התחלה";
  }
}

function totalStepsFor(quiz: Quiz): number {
  return quiz.nodes.filter((n) => n.type === "question" || n.type === "name" || n.type === "lead_details").length;
}

type Entry =
  | { id: string; kind: "bot"; nodeId: string; ts: number }
  | { id: string; kind: "result"; nodeId: string; ts: number }
  | { id: string; kind: "user"; text: string; ts: number }
  | { id: string; kind: "typing"; ts: number };

interface LeadInfoState {
  name: string;
  phone: string;
  email: string;
  consent: boolean;
}

export function QuizRunner({ quiz, session }: { quiz: Quiz; session?: PublicSession }) {
  const supabase = useMemo(() => createClient(), []);
  const [resolvedNodes, setResolvedNodes] = useState<Record<string, QuizNode>>({});
  const nodesById = useMemo(() => new Map([...quiz.nodes.map((node): [string, QuizNode] => [node.id, node.data.kind==="action" && node.data.actionKind==="redirect" ? {...node,type:"end",data:{kind:"end",title:"ממשיכים...",text:"",redirectEnabled:true,redirectUrl:node.data.redirectUrl,redirectDelaySeconds:0}} : node]), ...Object.entries(resolvedNodes)]), [quiz.nodes, resolvedNodes]);
  const searchParams = useSearchParams();
  const utmSource = searchParams.get("utm_source") ?? undefined;
  const startedRef = useRef(false);
  const submittedRef = useRef(false);
  const advancingRef = useRef(false);
  const [submissionState, setSubmissionState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  const firstNode = useMemo(() => {
    const start = getStartNode(quiz);
    return start ? resolveRenderable(quiz, start.id, null, { sessionId: session?.sessionId ?? quiz.id, utmSource }) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [entries, setEntries] = useState<Entry[]>(() => {
    if (!firstNode) return [];
    if (firstNode.type === "end") return [{ id: uid(), kind: "result", nodeId: firstNode.id, ts: Date.now() }];
    return [{ id: uid(), kind: "bot", nodeId: firstNode.id, ts: Date.now() }];
  });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(() =>
    firstNode && firstNode.type !== "end" ? firstNode.id : null
  );
  // The path of active nodes visited so far, in order — lets the "back"
  // button return to the previous question without having to re-walk the
  // (possibly branching) flow graph.
  const [history, setHistory] = useState<string[]>(() =>
    firstNode && firstNode.type !== "end" ? [firstNode.id] : []
  );
  const [answers, setAnswers] = useState<Record<string, LeadAnswer>>({});
  const [leadInfo, setLeadInfo] = useState<LeadInfoState>({ name: "", phone: "", email: "", consent: false });
  const paramValues = useMemo(() => {
    const values: Record<string, string> = { name: leadInfo.name, phone: leadInfo.phone, email: leadInfo.email };
    for (const a of Object.values(answers)) {
      values[a.paramKey || a.nodeId] = a.answerLabel;
    }
    return values;
  }, [answers, leadInfo]);

  // Meta Pixel/CAPI + GTM tracking (separate from the quiz's own analytics/
  // integrations calls above — additive, doesn't affect existing behavior).
  const sessionIdRef = useRef<string>(session?.sessionId ?? crypto.randomUUID());
  const trackingRef = useRef<{ settings: QuizTrackingSettings; events: QuizTrackingEvent[] } | null>(null);
  const firedPageLoadRef = useRef(false);
  const leadInfoRef = useRef(leadInfo);
  useEffect(() => {
    leadInfoRef.current = leadInfo;
  }, [leadInfo]);
  const activeNodeIdRef = useRef(activeNodeId);
  useEffect(() => {
    activeNodeIdRef.current = activeNodeId;
  }, [activeNodeId]);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Live session tracking for the "מרכז שיחות" live view — reuses the same
  // sessionIdRef as the Pixel/CAPI dedup above. Fire-and-forget, non-blocking.
  const totalStepsRef = useRef(totalStepsFor(quiz));
  function pushSessionUpdate(node: QuizNode, stepIndex: number, status: "active" | "completed", mergedAnswers: Record<string, LeadAnswer>, mergedScore: number) {
    if (!session) return;
    const lead = leadInfoRef.current;
    const category = mergedScore >= 26 ? "hot" : mergedScore >= 16 ? "warm" : "cold";
    const answersPayload: QuizSessionAnswer[] = Object.values(mergedAnswers);
    fetch("/api/quiz-sessions/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        quizId: quiz.id,
        stepIndex,
        totalSteps: totalStepsRef.current,
        currentNodeId: node.id,
        currentNodeTitle: titleForNode(node),
        status,
        name: lead.name || undefined,
        phone: lead.phone || undefined,
        email: lead.email || undefined,
        score: mergedScore,
        category,
        utmSource,
        utmMedium: searchParams.get("utm_medium") ?? undefined,
        utmCampaign: searchParams.get("utm_campaign") ?? undefined,
        answers: answersPayload,
      }),
    }).catch(() => {});
  }

  function fireEventsForTrigger(triggerKey: string | null, answerForScore?: LeadAnswer) {
    const tracking = trackingRef.current;
    if (!tracking) return;
    const conditionContext: Record<string, string | number | undefined> = {};
    if (answerForScore) conditionContext[answerForScore.nodeId] = answerForScore.answerLabel;
    for (const ev of tracking.events) {
      if (ev.triggerNodeId !== triggerKey) continue;
      fireTrackingEvent(ev, {
        sessionId: sessionIdRef.current,
        sessionToken: session?.token,
        quizId: quiz.id,
        settings: tracking.settings,
        phone: leadInfoRef.current.phone || undefined,
        email: leadInfoRef.current.email || undefined,
        conditionContext,
      });
    }
  }

  useEffect(() => {
    if (!session) return;
    recordAnalyticsEvent(supabase, quiz.id, "view", utmSource, session);
    (async () => {
      const [settings, events] = await Promise.all([
        getTrackingSettings(supabase, quiz.id),
        listTrackingEvents(supabase, quiz.id),
      ]);
      trackingRef.current = { settings, events };
      if (!firedPageLoadRef.current) {
        firedPageLoadRef.current = true;
        fireEventsForTrigger(null);
      }
    })().catch(() => {});
    if (firstNode && firstNode.type !== "end") {
      pushSessionUpdate(firstNode, 0, "active", {}, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat for the "מרכז שיחות" live view: re-sends the current step
  // every 10s while the tab is visible, so a session goes stale quickly
  // (see LIVE_WINDOW_MS) once the visitor closes the tab, switches away,
  // or otherwise stops actually looking at the quiz — instead of only
  // updating on step transitions, which leaves a long silent gap while
  // someone is just thinking or has already left.
  useEffect(() => {
    const HEARTBEAT_MS = 10_000;
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (submittedRef.current) return;
      const nodeId = activeNodeIdRef.current;
      if (!nodeId) return;
      const node = nodesById.get(nodeId);
      if (!node) return;
      const mergedAnswers = answersRef.current;
      const mergedScore = Object.values(mergedAnswers).reduce((sum, a) => sum + a.score, 0);
      pushSessionUpdate(node, Object.keys(mergedAnswers).length, "active", mergedAnswers, mergedScore);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keep the welcome logo visible on the initial screen, including mobile.
    if (entries.length === 1) return;
    // Land the new active question near the middle of the screen instead of
    // pinned to the very bottom, so it doesn't feel like it's hiding at the edge.
    if (activeNodeId && activeNodeRef.current) {
      activeNodeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [entries, activeNodeId]);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  async function submitLead(finalAnswers: Record<string, LeadAnswer>, finalScore: number) {
    if (submittedRef.current || !session) return;
    submittedRef.current = true;
    setSubmissionError(null);
    setSubmissionState("saving");
    retryRef.current = () => { void submitLead(finalAnswers, finalScore); };
    try {
    const lead = leadInfoRef.current;
    const category = finalScore >= 26 ? "hot" : finalScore >= 16 ? "warm" : "cold";
    const leadId = await submitPublicQuizResponse(
      supabase,
      quiz,
      {
        name: lead.name || "ללא שם",
        phone: lead.phone,
        email: lead.email,
        consent: lead.consent,
        score: finalScore,
        category,
        utmSource,
        utmMedium: searchParams.get("utm_medium") ?? undefined,
        utmCampaign: searchParams.get("utm_campaign") ?? undefined,
        utmContent: searchParams.get("utm_content") ?? undefined,
      },
      Object.values(finalAnswers),
      session
    );
    recordAnalyticsEvent(supabase, quiz.id, "complete", utmSource, session);
    triggerIntegrations(leadId, session.token);
    setSubmissionState("saved");
    } catch {
      submittedRef.current = false;
      setSubmissionState("failed");
      setSubmissionError("לא הצלחנו לשמור את הפרטים. לחצו כדי לנסות שוב.");
    }
  }

  function advanceTo(fromId: string, handle: string | null, answerForScore?: LeadAnswer) {
    if (!startedRef.current) {
      startedRef.current = true;
      if (session) recordAnalyticsEvent(supabase, quiz.id, "start", utmSource, session);
    }
    const nextAnswers = answerForScore ? { ...answers, [answerForScore.nodeId]: answerForScore } : answers;
    const next = resolveRenderable(quiz, fromId, handle, {answers:nextAnswers,score:Object.values(nextAnswers).reduce((s,a)=>s+a.score,0),utmSource,sessionId:sessionIdRef.current});
    if (next && (!nodesById.has(next.id) || (next.data.kind === "end" && nodesById.get(next.id)?.data.kind === "action"))) {
      setResolvedNodes((previous) => ({ ...previous, [next.id]: next }));
    }
    setActiveNodeId(null);
    if (!next) { advancingRef.current = false; setActiveNodeId(fromId); return; }

    const mergedAnswers = answerForScore ? { ...answers, [answerForScore.nodeId]: answerForScore } : answers;
    const mergedScore = Object.values(mergedAnswers).reduce((sum, a) => sum + a.score, 0);

    const typingId = uid();
    setEntries((es) => [...es, { id: typingId, kind: "typing", ts: Date.now() }]);
    setTimeout(() => {
      advancingRef.current = false;
      setEntries((es) => {
        const withoutTyping = es.filter((e) => e.id !== typingId);
        if (next.type === "end") {
          return [...withoutTyping, { id: uid(), kind: "result", nodeId: next.id, ts: Date.now() }];
        }
        return [...withoutTyping, { id: uid(), kind: "bot", nodeId: next.id, ts: Date.now() }];
      });
      if (next.type === "end") {
        if (leadInfoRef.current.phone || leadInfoRef.current.email || leadInfoRef.current.name) void submitLead(mergedAnswers, mergedScore);
      } else {
        setActiveNodeId(next.id);
        setHistory((h) => [...h, next.id]);
      }
      pushSessionUpdate(next, Object.keys(mergedAnswers).length, next.type === "end" ? "completed" : "active", mergedAnswers, mergedScore);
      fireEventsForTrigger(next.id, answerForScore);
      if (next.type === "end") fireEventsForTrigger("__end__", answerForScore);
    }, 650);
  }

  function handleComplete(node: QuizNode, userText: string, handle: string | null, answer?: LeadAnswer) {
    if (advancingRef.current || activeNodeIdRef.current !== node.id) return;
    advancingRef.current = true;
    if (answer) setAnswers((a) => ({ ...a, [node.id]: answer }));
    setEntries((es) => [...es, { id: uid(), kind: "user", text: userText, ts: Date.now() }]);
    if (node.data.kind === "lead_details") fireEventsForTrigger("__lead_details__");
    advanceTo(node.id, handle, answer);
  }

  // Undoes the last step: drops the answer bubble and the current
  // question, and re-activates whichever question came before it.
  function goBack() {
    if (!quiz.allowBack || advancingRef.current || history.length < 2) return;
    const prevId = history[history.length - 2];
    setHistory((h) => h.slice(0, -1));
    setAnswers((a) => {
      const rest = { ...a };
      delete rest[prevId];
      return rest;
    });
    setEntries((es) => es.slice(0, -2));
    setActiveNodeId(prevId);
  }

  const PALETTE = buildPalette(quiz.theme);
  const desktopBg = backgroundValue(quiz.theme.backgroundImageUrl, PALETTE.page);
  const mobileBg = backgroundValue(quiz.theme.backgroundImageUrlMobile, desktopBg);

  if (!firstNode) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-6" style={{ background: PALETTE.page }}>
        <p style={{ color: PALETTE.text }}>השאלון עדיין לא כולל תוכן.</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="qf-runner-bg min-h-screen" style={{ fontFamily: PALETTE.fontFamily, fontSize: PALETTE.fontSize, fontWeight: 500 }}>
      <style>{`.qf-runner-bg{background:${desktopBg};}@media (max-width:767px){.qf-runner-bg{background:${mobileBg};}}`}</style>
      <div className="mx-auto max-w-[680px] px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        {submissionState === "saving" && <p role="status" className="mb-4 text-center">שומרים את הפרטים...</p>}
        {submissionError && <div role="alert" className="mb-4 rounded-lg bg-white p-4 text-red-700">{submissionError}<button className="mx-2 underline" onClick={() => retryRef.current?.()}>נסו שוב</button></div>}
        <div className="space-y-5">
          {entries.map((entry) => {
            if (entry.kind === "user") {
              return (
                <div key={entry.id} className="flex justify-end">
                  <div className="flex max-w-[75%] flex-col items-end gap-1">
                    <div
                      className="px-5 py-3 leading-relaxed"
                      style={{ background: PALETTE.bubbleUser, color: PALETTE.text, borderRadius: Math.max(0, PALETTE.radius - 2) }}
                    >
                      {entry.text}
                    </div>
                  </div>
                </div>
              );
            }

            if (entry.kind === "typing") {
              return (
                <div key={entry.id} className="flex items-end justify-start gap-2">
                  <Avatar url={quiz.theme.avatarUrl} />
                  <div className="flex items-center gap-1.5 bg-white px-5 py-4" style={{ background: PALETTE.bubbleBot, borderRadius: PALETTE.radius }}>
                    <span className="size-2 animate-bounce rounded-full bg-current" style={{ color: PALETTE.muted }} />
                    <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:0.15s]" style={{ color: PALETTE.muted }} />
                    <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:0.3s]" style={{ color: PALETTE.muted }} />
                  </div>
                </div>
              );
            }

            if (entry.kind === "result") {
              const node = nodesById.get(entry.nodeId);
              if (!node || node.data.kind !== "end") return null;
              return <ResultCard key={entry.id} canRedirect={submissionState === "idle" || submissionState === "saved"} data={node.data} palette={PALETTE} avatarUrl={quiz.theme.avatarUrl} params={paramValues} />;
            }

            const node = nodesById.get(entry.nodeId);
            if (!node) return null;
            const isActive = entry.nodeId === activeNodeId;

            const blockImageUrl =
              node.data.kind === "message" ? node.data.imageUrl : node.data.kind === "question" ? node.data.imageUrl : undefined;
            const imageBelow = node.data.kind === "question" && node.data.imagePosition === "below";
            const imageCard = blockImageUrl && (
              <div
                key="image"
                className={`self-start bg-white px-6 py-8 sm:px-8 sm:py-10 ${imageBelow ? "mt-1.5" : "mb-1.5"}`}
                style={{ width: "calc(100% - 36px)", maxWidth: 528, marginInlineStart: 36, borderRadius: `${PALETTE.radius}px ${PALETTE.radius}px ${PALETTE.radius}px 2px` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blockImageUrl} alt="" className="mx-auto block h-auto w-full max-w-[80%] object-contain" />
              </div>
            );
            const controls = isActive && (
              <NodeControls
                node={node}
                palette={PALETTE}
                leadInfo={leadInfo}
                onLeadInfoChange={(patch) => {
                  leadInfoRef.current = { ...leadInfoRef.current, ...patch };
                  setLeadInfo(leadInfoRef.current);
                }}
                onComplete={(text, handle, answer) => handleComplete(node, text, handle, answer)}
              />
            );
            const bubbleRow = (
              <div key="bubble" className="flex w-full min-w-0 items-end gap-0.5">
                <Avatar url={quiz.theme.avatarUrl} />
                <div
                  className="w-fit min-w-0 max-w-[calc(100%-36px)] px-5 py-4 leading-[1.35] sm:px-6"
                  style={{ width: isActive && (node.data.kind === "name" || node.data.kind === "lead_details") ? 420 : undefined, background: PALETTE.bubbleBot, color: PALETTE.text, borderRadius: `${PALETTE.radius}px ${PALETTE.radius}px ${PALETTE.radius}px 2px`, overflowWrap: "anywhere" }}
                >
                  <BotNodeContent node={node} params={paramValues} />
                  {(node.data.kind === "name" || node.data.kind === "lead_details") && controls}
                </div>
              </div>
            );
            const controlsRow = isActive && node.data.kind !== "name" && node.data.kind !== "lead_details" && (
              <div
                key="controls"
                className="mt-4 self-start"
                style={{ width: "calc(100% - 36px)", marginInlineStart: 36 }}
              >
                {controls}
              </div>
            );

            return (
              <div key={entry.id} className="flex justify-start">
                <div ref={isActive ? activeNodeRef : undefined} className="flex w-full min-w-0 flex-col items-end">
                  {imageBelow ? [bubbleRow, imageCard] : [imageCard, bubbleRow]}
                  {controlsRow}
                  {isActive && quiz.allowBack && history.length > 1 && (
                    <button
                      onClick={goBack}
                      className="mt-3 flex w-fit items-center gap-1.5 self-start rounded-full bg-black/5 px-4 py-2 text-xs font-medium"
                      style={{ color: PALETTE.text }}
                    >
                      חזרה
                      <ArrowLeft className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {entries.length > 1 && (
      <button
        onClick={scrollToBottom}
        className="fixed bottom-6 left-1/2 flex size-11 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-lg"
        style={{ color: PALETTE.buttonText }}
        aria-label="גלול למטה"
      >
        <ChevronDown className="size-5" />
      </button>
      )}
    </div>
  );
}

// Image-led welcome cards keep the short greeting with the first paragraph.
// Other authored line breaks are preserved.
function formatImageIntro(text: string, imageUrl?: string): string {
  return imageUrl
    ? text.replace(/^(היי|הי|שלום)([^\n]*)\n(?:[ \t]*\n)+/u, "$1$2\n")
    : text;
}

function BotNodeContent({ node, params }: { node: QuizNode; params: Record<string, string> }) {
  if (node.data.kind === "message") {
    // the image (if any) renders as its own separate floating card above
    // this bubble — see the "bot" entry case in the main render.
    const text = interpolateParams(node.data.text, params);
    const displayText = formatImageIntro(text, node.data.imageUrl);
    return <p className="whitespace-pre-line">{renderRichText(displayText)}</p>;
  }
  if (node.data.kind === "question") {
    // the image (if any) renders as its own separate floating card, above
    // or below this bubble per imagePosition — see the "bot" entry case.
    return <p className="whitespace-pre-line">{renderRichText(formatImageIntro(interpolateParams(node.data.title, params), node.data.imageUrl))}</p>;
  }
  if (node.data.kind === "name") {
    return <p>{node.data.title}</p>;
  }
  if (node.data.kind === "lead_details") {
    return (
      <p className="whitespace-pre-line">
        {renderRichText(interpolateParams(node.data.title || "השאירו פרטים ונחזור אליכם", params))}
      </p>
    );
  }
  return null;
}

function NodeControls({
  node,
  palette,
  leadInfo,
  onLeadInfoChange,
  onComplete,
}: {
  node: QuizNode;
  palette: Palette;
  leadInfo: LeadInfoState;
  onLeadInfoChange: (patch: Partial<LeadInfoState>) => void;
  onComplete: (userText: string, handle: string | null, answer?: LeadAnswer) => void;
}) {
  const PALETTE = palette;
  const [text, setText] = useState(node.data.kind === "name" ? leadInfo.name : "");
  const [multi, setMulti] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const autoAdvanceFiredRef = useRef(false);

  useEffect(() => {
    if (node.data.kind !== "message" || !node.data.autoAdvance) return;
    const data = node.data;
    const timer = setTimeout(() => {
      if (autoAdvanceFiredRef.current) return;
      autoAdvanceFiredRef.current = true;
      onComplete(data.buttonLabel || "המשך", null);
    }, Math.max(1, data.autoAdvanceSeconds) * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per node, deliberately not re-armed by parent re-renders
  }, [node.id]);

  if (node.data.kind === "message") {
    const data = node.data;
    if (data.autoAdvance) return null;
    return (
      <button
        onClick={() => onComplete(data.buttonLabel || "המשך", null)}
        className="min-h-[50px] w-full rounded-[4px] border-2 bg-white px-6 py-3 text-[length:inherit] font-medium transition-transform active:scale-[0.97] sm:w-[31%] sm:min-w-[140px]"
        style={{ borderColor: PALETTE.buttonBorder, color: PALETTE.buttonText }}
      >
        {data.buttonLabel || "המשך"}
      </button>
    );
  }

  if (node.data.kind === "name") {
    const data = node.data;
    const hintId = `name-hint-${node.id}`;
    return (
      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          const name = text.trim();
          if (data.required && !name) return;
          onLeadInfoChange({ name });
          onComplete(name || "—", null, { nodeId: node.id, questionTitle: data.title, answerLabel: name || "—", score: 0, paramKey: data.paramKey });
        }}
      >
        <div
          className="flex min-h-[58px] items-center rounded-[4px] border-2 bg-white focus-within:ring-2 focus-within:ring-current/20"
          style={{ borderColor: PALETTE.buttonText, color: PALETTE.buttonText }}
        >
          <input
            aria-label={data.title || "שם"}
            aria-describedby={hintId}
            autoComplete="name"
            maxLength={200}
            enterKeyHint="next"
            required={data.required}
            placeholder={data.placeholder && data.placeholder !== "השם שלך" ? data.placeholder : "תקליד/י כאן"}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            }}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-right text-[length:inherit] outline-none placeholder:opacity-60"
            style={{ color: PALETTE.text }}
          />
          <button
            type="submit"
            aria-label="שליחת השם והמשך"
            disabled={!!data.required && !text.trim()}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center px-3 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2 12 22 3v7l-13 2 13 2v7L2 12Z" />
            </svg>
          </button>
        </div>
        <p id={hintId} className="mt-1.5 text-[0.8em]" style={{ color: PALETTE.text }}>לחצי על החץ לשליחה</p>
      </form>
    );
  }

  if (node.data.kind === "question") {
    const data = node.data;

    if (data.answerType === "single_choice") {
      return (
        <div className="space-y-2">
          {data.options.length > 1 && <p className="text-xs" style={{ color: PALETTE.muted }}>בחר/י תשובה</p>}
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
            {data.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() =>
                  onComplete(opt.label, data.combineAnswers ? null : opt.id, { nodeId: node.id, questionTitle: data.title, answerLabel: opt.label, optionIds: [opt.id], score: opt.score, paramKey: data.paramKey })
                }
                className="min-h-[50px] rounded-[4px] border-2 bg-white px-4 py-3 text-[length:inherit] font-medium transition-transform active:scale-[0.97] sm:min-w-[140px] sm:basis-[31%] sm:grow-0"
                style={{ borderColor: PALETTE.buttonBorder, color: PALETTE.buttonText }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (data.answerType === "multi_choice") {
      return (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: PALETTE.muted }}>ניתן לבחור כמה תשובות</p>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
            {data.options.map((opt) => {
              const checked = multi.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMulti((m) => (checked ? m.filter((id) => id !== opt.id) : [...m, opt.id]))}
                  className="flex items-center gap-2 min-h-[50px] rounded-[4px] border-2 bg-white px-4 py-3 text-[length:inherit] font-medium sm:min-w-[140px] sm:basis-[31%] sm:grow-0"
                  style={{ borderColor: checked ? PALETTE.buttonText : PALETTE.buttonBorder, color: PALETTE.buttonText }}
                >
                  <Checkbox checked={checked} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: PALETTE.buttonText }}
            disabled={data.required && multi.length === 0}
            onClick={() => {
              const labels = data.options.filter((o) => multi.includes(o.id)).map((o) => o.label).join(", ");
              const totalScore = data.options.filter((o) => multi.includes(o.id)).reduce((s, o) => s + o.score, 0);
              onComplete(labels || "—", data.combineAnswers ? null : multi[0] ?? null, { nodeId: node.id, questionTitle: data.title, answerLabel: labels || "—", optionIds: multi, score: totalScore, paramKey: data.paramKey });
            }}
          >
            המשך
          </button>
        </div>
      );
    }

    const submitFreeform = () => {
      if (!text.trim() && data.required) return;
      onComplete(text || "—", null, {
        nodeId: node.id,
        questionTitle: data.title,
        answerLabel: text || "—",
        score: data.answerType === "rating" ? Number(text) || 0 : 0,
        paramKey: data.paramKey,
      });
      setText("");
    };

    if (data.answerType === "rating") {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setText(String(n))}
                className="aspect-square rounded-lg border-2 text-sm font-semibold"
                style={{
                  borderColor: PALETTE.buttonBorder,
                  background: text === String(n) ? PALETTE.buttonText : "white",
                  color: text === String(n) ? "white" : PALETTE.buttonText,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: PALETTE.buttonText }}
            onClick={submitFreeform}
            disabled={!text}
          >
            המשך
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {data.answerType === "long_text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2"
            style={{ borderColor: PALETTE.buttonBorder }}
          />
        ) : (
          <input
            type={data.answerType === "number" ? "number" : data.answerType === "date" ? "date" : "text"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2"
            style={{ borderColor: PALETTE.buttonBorder }}
          />
        )}
        <button
          className="w-full rounded-lg py-3 text-sm font-semibold text-white"
          style={{ background: PALETTE.buttonText }}
          onClick={submitFreeform}
        >
          המשך
        </button>
      </div>
    );
  }

  if (node.data.kind === "lead_details") {
    const data = node.data;

    function handleSubmit() {
      if (data.showEmail && data.requireEmail && !leadInfo.email.trim()) {
        setError("יש להזין כתובת מייל");
        return;
      }
      if (data.showEmail && leadInfo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadInfo.email)) {
        setError("כתובת אימייל לא תקינה");
        return;
      }
      if (data.showPhone && data.requirePhoneIL && !isValidIsraeliPhone(leadInfo.phone)) {
        setError("מספר טלפון לא תקין");
        return;
      }
      if (data.showConsent && !leadInfo.consent) {
        setError("יש לאשר את תנאי ההסכמה כדי להמשיך");
        return;
      }
      setError(null);
      onComplete(leadInfo.name || "הפרטים נשלחו", null);
    }

    const inputClass = "min-h-[58px] w-full rounded-[4px] border-2 bg-white px-4 py-3 text-right text-[length:inherit] outline-none placeholder:opacity-60 focus:ring-2 focus:ring-current/20";
    const inputStyle = { borderColor: PALETTE.buttonText, color: PALETTE.text };
    return (
      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
        {data.showName && (
          <label className="block space-y-2">
            <span className="block">שם מלא</span>
            <input
              autoComplete="name"
              placeholder="מה השם שלך?"
              maxLength={200}
              value={leadInfo.name}
              onChange={(event) => onLeadInfoChange({ name: event.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </label>
        )}
        {data.showPhone && (
          <label className="block w-1/2 min-w-[150px] max-w-full space-y-2">
            <span className="block">טלפון{data.requirePhoneIL ? "*" : ""}</span>
            <input
              placeholder="מה הטלפון שלך?"
              type="tel"
              autoComplete="tel"
              required={data.requirePhoneIL}
              maxLength={40}
              dir="ltr"
              value={leadInfo.phone}
              onChange={(event) => onLeadInfoChange({ phone: event.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </label>
        )}
        {data.showEmail && (
          <label className="block space-y-2">
            <span className="block">מייל{data.requireEmail ? "*" : ""}</span>
            <input
              placeholder="מה המייל שלך?"
              type="email"
              autoComplete="email"
              required={data.requireEmail}
              maxLength={254}
              dir="ltr"
              value={leadInfo.email}
              onChange={(event) => onLeadInfoChange({ email: event.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </label>
        )}
        {data.showConsent && (
          <div className="space-y-2">
            <p>אישור שליחה*</p>
            <label className="flex cursor-pointer items-center gap-3 leading-[1.4]" style={{ color: PALETTE.text }}>
              <input
                type="checkbox"
                required
                checked={leadInfo.consent}
                onChange={(event) => onLeadInfoChange({ consent: event.target.checked })}
                className="size-4 shrink-0"
                style={{ accentColor: PALETTE.buttonText }}
              />
              <span>{data.consentText}</span>
            </label>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end pt-1">
          <button type="submit" className="min-h-11 rounded-[4px] border bg-white px-4 py-2 text-[length:inherit] font-semibold" style={{ borderColor: PALETTE.buttonBorder, color: PALETTE.buttonText }}>
            {data.buttonLabel || "שליחה"}
          </button>
        </div>
      </form>
    );
  }

  return null;
}

function ResultCard({
  canRedirect,
  data,
  palette,
  avatarUrl,
  params,
}: {
  canRedirect: boolean;
  data: Extract<QuizNode["data"], { kind: "end" }>;
  palette: Palette;
  avatarUrl?: string;
  params: Record<string, string>;
}) {
  const PALETTE = palette;
  const redirectUrl = safeLink(data.redirectUrl);
  const ctaUrl = safeLink(data.ctaUrl);
  const shouldRedirect = !!(canRedirect && data.redirectEnabled && redirectUrl);
  const [secondsLeft, setSecondsLeft] = useState(Math.min(300, Math.max(0, data.redirectDelaySeconds ?? 3)));

  useEffect(() => {
    if (!shouldRedirect) return;
    if (secondsLeft <= 0) {
      window.location.href = redirectUrl!;
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [shouldRedirect, secondsLeft, redirectUrl]);

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[92%] border-2 bg-white p-6 text-center shadow-md sm:max-w-[85%]"
        style={{ borderColor: PALETTE.buttonBorder, color: PALETTE.text, borderRadius: PALETTE.radius + 2 }}
      >
        <div className="mb-3 flex justify-center">
          <Avatar url={avatarUrl} size={48} />
        </div>
        <h2 className="whitespace-pre-line text-xl">{renderRichText(interpolateParams(data.title, params))}</h2>
        <p className="mt-2 whitespace-pre-line leading-relaxed">{renderRichText(interpolateParams(data.text, params))}</p>
        {shouldRedirect && (
          <p className="mt-3 text-xs" style={{ color: PALETTE.muted }}>מעביר אותך אוטומטית תוך {secondsLeft} שניות...</p>
        )}
        {data.ctaLabel && ctaUrl && (
          <a
            href={ctaUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block rounded-lg border-2 bg-white py-3 text-sm font-semibold"
            style={{ borderColor: PALETTE.buttonBorder, color: PALETTE.buttonText }}
          >
            {data.ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}
