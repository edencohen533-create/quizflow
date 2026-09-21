import { ReactNode } from "react";
import { Handle, Position } from "reactflow";
import { NodeType } from "@/lib/types";
import { NODE_META } from "@/components/editor/node-meta";

export function BaseNode({
  type,
  title,
  selected,
  showTarget = true,
  showSource = true,
  children,
  connected,
}: {
  type: NodeType;
  title: string;
  selected?: boolean;
  showTarget?: boolean;
  showSource?: boolean;
  children?: ReactNode;
  connected?: boolean;
}) {
  const meta = NODE_META[type];
  const Icon = meta.icon;
  return (
    <div
      className={`w-64 rounded-xl border bg-card shadow-sm transition-shadow ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      {showTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !bg-muted-foreground/50 !border-2 !border-card"
        />
      )}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={`flex size-6 items-center justify-center rounded-md ${meta.color}`}>
          <Icon className="size-3.5" />
        </span>
        <span className="text-xs font-semibold flex-1 truncate">{title}</span>
        {!connected && (
          <span title="צומת לא מחובר" className="size-1.5 rounded-full bg-amber-500 shrink-0" />
        )}
      </div>
      {children && <div className="px-3 py-2 text-xs text-muted-foreground space-y-1">{children}</div>}
      {showSource && (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !bg-primary !border-2 !border-card"
        />
      )}
    </div>
  );
}
