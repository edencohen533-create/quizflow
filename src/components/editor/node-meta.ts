import {
  MessageSquare,
  HelpCircle,
  User,
  UserSquare2,
  GitBranch,
  Gauge,
  Zap,
  FlagTriangleRight,
  PlayCircle,
  LucideIcon,
} from "lucide-react";
import { NodeType } from "@/lib/types";

export const NODE_META: Record<NodeType, { label: string; icon: LucideIcon; color: string }> = {
  start: { label: "התחלה", icon: PlayCircle, color: "text-emerald-600 bg-emerald-500/10" },
  message: { label: "הודעה", icon: MessageSquare, color: "text-sky-600 bg-sky-500/10" },
  question: { label: "שאלה", icon: HelpCircle, color: "text-violet-600 bg-violet-500/10" },
  name: { label: "שם", icon: User, color: "text-teal-600 bg-teal-500/10" },
  lead_details: { label: "שדה פרטים", icon: UserSquare2, color: "text-orange-600 bg-orange-500/10" },
  condition: { label: "תנאי", icon: GitBranch, color: "text-amber-600 bg-amber-500/10" },
  score: { label: "חישוב ניקוד", icon: Gauge, color: "text-pink-600 bg-pink-500/10" },
  action: { label: "פעולה", icon: Zap, color: "text-blue-600 bg-blue-500/10" },
  end: { label: "סיום", icon: FlagTriangleRight, color: "text-rose-600 bg-rose-500/10" },
};

export const TOOLBAR_NODE_TYPES: NodeType[] = [
  "message",
  "question",
  "name",
  "lead_details",
  "condition",
  "score",
  "action",
  "end",
];
