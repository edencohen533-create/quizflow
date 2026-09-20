export type NodeType =
  | "start"
  | "message"
  | "question"
  | "name"
  | "lead_details"
  | "condition"
  | "score"
  | "action"
  | "end";

export type QuestionAnswerType =
  | "single_choice"
  | "multi_choice"
  | "short_text"
  | "long_text"
  | "number"
  | "rating"
  | "date";

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
  score: number;
  nextNodeId: string | null;
}

export interface StartNodeData {
  kind: "start";
}

export interface MessageNodeData {
  kind: "message";
  title: string;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  buttonLabel: string;
  nextNodeId: string | null;
}

export interface QuestionNodeData {
  kind: "question";
  title: string;
  description?: string;
  answerType: QuestionAnswerType;
  required: boolean;
  allowOther: boolean;
  options: QuestionOption[];
  // used for non-choice answer types (text/number/rating/date) — single continuation
  nextNodeId: string | null;
}

export interface NameNodeData {
  kind: "name";
  title: string;
  placeholder?: string;
  required: boolean;
  nextNodeId: string | null;
}

export interface LeadDetailsNodeData {
  kind: "lead_details";
  showName: boolean;
  showPhone: boolean;
  showEmail: boolean;
  requirePhoneIL: boolean;
  showConsent: boolean;
  consentText: string;
  nextNodeId: string | null;
}

export interface ConditionRule {
  id: string;
  sourceField: "score" | "utm_source" | "answer";
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
  value: string;
  targetNodeId: string | null;
}

export interface ConditionNodeData {
  kind: "condition";
  rules: ConditionRule[];
  elseNodeId: string | null;
}

export interface ScoreNodeData {
  kind: "score";
  hotThreshold: number;
  warmThreshold: number;
  nextNodeId: string | null;
}

export type ActionKind =
  | "webhook"
  | "crm"
  | "email"
  | "google_sheets"
  | "redirect"
  | "meta_pixel"
  | "tiktok_pixel";

export interface ActionNodeData {
  kind: "action";
  actionKind: ActionKind;
  webhookUrl?: string;
  redirectUrl?: string;
  nextNodeId: string | null;
}

export interface EndNodeData {
  kind: "end";
  title: string;
  text: string;
  ctaLabel?: string;
  ctaUrl?: string;
  redirectEnabled?: boolean;
  redirectUrl?: string;
  redirectDelaySeconds?: number;
}

export type QuizNodeData =
  | StartNodeData
  | MessageNodeData
  | QuestionNodeData
  | NameNodeData
  | LeadDetailsNodeData
  | ConditionNodeData
  | ScoreNodeData
  | ActionNodeData
  | EndNodeData;

export interface QuizNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: QuizNodeData;
}

export interface QuizEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
}

export type QuizStatus = "draft" | "active" | "paused";

export interface QuizTheme {
  logoUrl?: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundImageUrl?: string;
  overlay: "none" | "light" | "dark";
  fontFamily: "assistant" | "heebo";
  buttonStyle: "rounded" | "square" | "pill";
  cardPosition: "center" | "right" | "left";
  showProgressBar: boolean;
  showQuestionNumber: boolean;
  customCss?: string;
}

export const THEME_PRESETS: Record<string, QuizTheme> = {
  clean_light: {
    primaryColor: "#10b981",
    backgroundColor: "#f8fafc",
    textColor: "#0f172a",
    overlay: "none",
    fontFamily: "assistant",
    buttonStyle: "pill",
    cardPosition: "center",
    showProgressBar: true,
    showQuestionNumber: true,
  },
  dark_premium: {
    primaryColor: "#10b981",
    backgroundColor: "#0b0f14",
    textColor: "#f1f5f9",
    overlay: "dark",
    fontFamily: "heebo",
    buttonStyle: "rounded",
    cardPosition: "center",
    showProgressBar: true,
    showQuestionNumber: false,
  },
  solina_green: {
    primaryColor: "#059669",
    backgroundColor: "#ecfdf5",
    textColor: "#064e3b",
    overlay: "light",
    fontFamily: "assistant",
    buttonStyle: "pill",
    cardPosition: "center",
    showProgressBar: true,
    showQuestionNumber: true,
  },
};

export interface Quiz {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  slug: string;
  status: QuizStatus;
  nodes: QuizNode[];
  edges: QuizEdge[];
  theme: QuizTheme;
  allowBack: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "new"
  | "in_progress"
  | "meeting_scheduled"
  | "closed"
  | "not_relevant";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "חדש",
  in_progress: "בטיפול",
  meeting_scheduled: "נקבעה פגישה",
  closed: "נסגר",
  not_relevant: "לא רלוונטי",
};

export interface LeadAnswer {
  nodeId: string;
  questionTitle: string;
  answerLabel: string;
  score: number;
}

export interface LeadNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  quizId: string;
  quizName: string;
  name: string;
  phone: string;
  email: string;
  score: number;
  category: "hot" | "warm" | "cold";
  status: LeadStatus;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  answers: LeadAnswer[];
  notes: LeadNote[];
  assignedTo?: string;
  createdAt: string;
  statusHistory: { status: LeadStatus; at: string }[];
}

export type IntegrationKind = "webhook" | "meta_pixel" | "tiktok_pixel";

export interface Integration {
  id: string;
  workspaceId: string;
  kind: IntegrationKind;
  name: string;
  enabled: boolean;
  // webhook
  url?: string;
  secret?: string;
  // pixels
  pixelId?: string;
  createdAt: string;
  lastTriggeredAt?: string;
  lastStatus?: "success" | "error";
  lastError?: string;
}

export interface AnalyticsPoint {
  date: string;
  views: number;
  starts: number;
  completions: number;
  leads: number;
}

// ---------------- Live sessions (מרכז שיחות) ----------------
// Live tracking of quiz-taking sessions: who's on which question right
// now, who progressed, who dropped off, who completed.

export type QuizSessionStatus = "active" | "completed";
// derived, not stored: "active" with a recent last_event_at is "live",
// "active" with a stale one is "abandoned".
export type QuizSessionDisplayStatus = "live" | "abandoned" | "completed";

export const SESSION_STATUS_LABELS: Record<QuizSessionDisplayStatus, string> = {
  live: "פעיל עכשיו",
  abandoned: "ננטש",
  completed: "הושלם",
};

export interface QuizSessionAnswer {
  nodeId: string;
  questionTitle: string;
  answerLabel: string;
}

export interface QuizSession {
  id: string;
  quizId: string;
  workspaceId: string;
  quizName: string;
  stepIndex: number;
  totalSteps: number;
  currentNodeId?: string;
  currentNodeTitle?: string;
  status: QuizSessionStatus;
  name?: string;
  phone?: string;
  email?: string;
  score: number;
  category?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  answers: QuizSessionAnswer[];
  isDemo: boolean;
  startedAt: string;
  lastEventAt: string;
  completedAt?: string;
}

// ---------------- Quiz tracking (Meta Pixel/CAPI + GTM) ----------------

export type TrackingEventName =
  | "PageView"
  | "Lead"
  | "ViewContent"
  | "InitiateCheckout"
  | "Purchase"
  | "CompleteRegistration"
  | "Custom";

export const TRACKING_EVENT_LABELS: Record<TrackingEventName, string> = {
  PageView: "PageView",
  Lead: "Lead",
  ViewContent: "ViewContent",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "Purchase",
  CompleteRegistration: "CompleteRegistration",
  Custom: "מותאם אישית",
};

export type TrackingConnectionStatus = "untested" | "success" | "error";

export interface QuizTrackingSettings {
  quizId: string;
  metaPixelId?: string;
  metaHasToken: boolean;
  metaLastTestStatus: TrackingConnectionStatus;
  metaLastTestError?: string;
  metaLastTestAt?: string;
  gtmContainerId?: string;
  updatedAt: string;
}

export interface TrackingCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: string;
}

export interface QuizTrackingEvent {
  id: string;
  quizId: string;
  name: TrackingEventName;
  customName?: string;
  triggerNodeId: string | null;
  sendToPixel: boolean;
  sendToCapi: boolean;
  sendToGtm: boolean;
  sendToCustomCode: boolean;
  customCode?: string;
  condition?: TrackingCondition;
  value?: number;
  currency?: string;
  enabled: boolean;
  createdAt: string;
}

export interface QuizTrackingActivity {
  id: string;
  quizId: string;
  message: string;
  createdAt: string;
}
