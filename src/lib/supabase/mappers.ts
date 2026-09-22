import {
  Lead,
  LeadAnswer,
  LeadNote,
  Quiz,
  QuizEdge,
  QuizNode,
  QuizNodeData,
  QuizTheme,
  NodeType,
  QuizSession,
  QuizSessionAnswer,
} from "@/lib/types";

export interface QuizRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  slug: string;
  status: "draft" | "active" | "paused";
  allow_back: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuizNodeRow {
  quiz_id: string;
  id: string;
  type: string;
  position_x: number;
  position_y: number;
  data: QuizNodeData;
}

export interface QuizEdgeRow {
  quiz_id: string;
  id: string;
  source: string;
  source_handle: string | null;
  target: string;
}

export interface QuizThemeRow {
  quiz_id: string;
  avatar_url: string | null;
  primary_color: string;
  background_color: string;
  text_color: string;
  muted_text_color: string | null;
  button_border_color: string | null;
  button_text_color: string | null;
  background_image_url: string | null;
  background_image_url_mobile: string | null;
  overlay: "none" | "light" | "dark";
  font_family: "assistant" | "heebo";
  button_style: "rounded" | "square" | "pill";
  card_position: "center" | "right" | "left";
  show_progress_bar: boolean;
  show_question_number: boolean;
  custom_css: string | null;
  corner_radius: number | null;
}

export interface LeadRow {
  id: string;
  workspace_id: string;
  quiz_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  score: number;
  category: "hot" | "warm" | "cold";
  status: Lead["status"];
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  assigned_to: string | null;
  created_at: string;
  quizzes?: { name: string } | null;
}

export function themeRowToTheme(row: QuizThemeRow): QuizTheme {
  return {
    avatarUrl: row.avatar_url ?? undefined,
    primaryColor: row.primary_color,
    backgroundColor: row.background_color,
    textColor: row.text_color,
    mutedTextColor: row.muted_text_color ?? undefined,
    buttonBorderColor: row.button_border_color ?? undefined,
    buttonTextColor: row.button_text_color ?? undefined,
    backgroundImageUrl: row.background_image_url ?? undefined,
    backgroundImageUrlMobile: row.background_image_url_mobile ?? undefined,
    overlay: row.overlay,
    fontFamily: row.font_family,
    buttonStyle: row.button_style,
    cardPosition: row.card_position,
    showProgressBar: row.show_progress_bar,
    showQuestionNumber: row.show_question_number,
    customCss: row.custom_css ?? undefined,
    cornerRadius: row.corner_radius ?? undefined,
  };
}

export function themeToRow(quizId: string, theme: QuizTheme): QuizThemeRow {
  return {
    quiz_id: quizId,
    avatar_url: theme.avatarUrl ?? null,
    primary_color: theme.primaryColor,
    background_color: theme.backgroundColor,
    text_color: theme.textColor,
    muted_text_color: theme.mutedTextColor ?? null,
    button_border_color: theme.buttonBorderColor ?? null,
    button_text_color: theme.buttonTextColor ?? null,
    background_image_url: theme.backgroundImageUrl ?? null,
    background_image_url_mobile: theme.backgroundImageUrlMobile ?? null,
    overlay: theme.overlay,
    font_family: theme.fontFamily,
    button_style: theme.buttonStyle,
    card_position: theme.cardPosition,
    show_progress_bar: theme.showProgressBar,
    show_question_number: theme.showQuestionNumber,
    custom_css: theme.customCss ?? null,
    corner_radius: theme.cornerRadius ?? null,
  };
}

export function nodeRowToNode(row: QuizNodeRow): QuizNode {
  return {
    id: row.id,
    type: row.type as NodeType,
    position: { x: row.position_x, y: row.position_y },
    data: row.data,
  };
}

export function nodeToRow(quizId: string, node: QuizNode): QuizNodeRow {
  return {
    quiz_id: quizId,
    id: node.id,
    type: node.type,
    position_x: node.position.x,
    position_y: node.position.y,
    data: node.data,
  };
}

export function edgeRowToEdge(row: QuizEdgeRow): QuizEdge {
  return { id: row.id, source: row.source, sourceHandle: row.source_handle, target: row.target };
}

export function edgeToRow(quizId: string, edge: QuizEdge): QuizEdgeRow {
  return { quiz_id: quizId, id: edge.id, source: edge.source, source_handle: edge.sourceHandle, target: edge.target };
}

export function quizRowToQuiz(
  quizRow: QuizRow,
  nodeRows: QuizNodeRow[],
  edgeRows: QuizEdgeRow[],
  themeRow: QuizThemeRow
): Quiz {
  return {
    id: quizRow.id,
    workspaceId: quizRow.workspace_id,
    name: quizRow.name,
    description: quizRow.description ?? undefined,
    slug: quizRow.slug,
    status: quizRow.status,
    nodes: nodeRows.map(nodeRowToNode),
    edges: edgeRows.map(edgeRowToEdge),
    theme: themeRowToTheme(themeRow),
    allowBack: quizRow.allow_back,
    createdAt: quizRow.created_at,
    updatedAt: quizRow.updated_at,
  };
}

export function leadRowToLead(row: LeadRow, answers: LeadAnswer[], notes: LeadNote[], statusHistory: { status: Lead["status"]; at: string }[]): Lead {
  return {
    id: row.id,
    quizId: row.quiz_id ?? "",
    quizName: row.quizzes?.name ?? "",
    name: row.name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    score: row.score,
    category: row.category,
    status: row.status,
    utmSource: row.utm_source ?? undefined,
    utmMedium: row.utm_medium ?? undefined,
    utmCampaign: row.utm_campaign ?? undefined,
    utmContent: row.utm_content ?? undefined,
    answers,
    notes,
    assignedTo: row.assigned_to ?? undefined,
    createdAt: row.created_at,
    statusHistory,
  };
}

export interface QuizSessionRow {
  id: string;
  quiz_id: string;
  workspace_id: string;
  quiz_name: string;
  step_index: number;
  total_steps: number;
  current_node_id: string | null;
  current_node_title: string | null;
  status: "active" | "completed";
  name: string | null;
  phone: string | null;
  email: string | null;
  score: number;
  category: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  answers: QuizSessionAnswer[];
  is_demo: boolean;
  started_at: string;
  last_event_at: string;
  completed_at: string | null;
}

export function sessionRowToSession(row: QuizSessionRow): QuizSession {
  return {
    id: row.id,
    quizId: row.quiz_id,
    workspaceId: row.workspace_id,
    quizName: row.quiz_name,
    stepIndex: row.step_index,
    totalSteps: row.total_steps,
    currentNodeId: row.current_node_id ?? undefined,
    currentNodeTitle: row.current_node_title ?? undefined,
    status: row.status,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    score: row.score,
    category: row.category ?? undefined,
    utmSource: row.utm_source ?? undefined,
    utmMedium: row.utm_medium ?? undefined,
    utmCampaign: row.utm_campaign ?? undefined,
    answers: row.answers ?? [],
    isDemo: row.is_demo,
    startedAt: row.started_at,
    lastEventAt: row.last_event_at,
    completedAt: row.completed_at ?? undefined,
  };
}
