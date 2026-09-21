import { ReactNode } from "react";
import { Handle, Position, useStore } from "reactflow";
import { NodeType } from "@/lib/types";
import { NODE_META } from "@/components/editor/node-meta";

const connectionInProgressSelector = (s: { connectionNodeId: string | null }) => s.connectionNodeId !== null;

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
  const connecting = useStore(connectionInProgressSelector);
  return (
    <div
      className={`relative w-64 rounded-xl border bg-card shadow-sm transition-shadow ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      {showTarget && (
        <>
          {/* Sized to the whole node instead of a tiny dot, so dropping a
              connection anywhere on this block — not just one exact point —
              connects it. The visual anchor stays the same (left-center),
              since that's still this element's Position.Left reference.
              Handles always get react-flow's "nodrag" class, so while idle
              this stays pointer-events-none — otherwise it would swallow
              every click/drag on the node, making it impossible to select
              or move a block that has no connections yet. */}
          <Handle
            type="target"
            position={Position.Left}
            className={`!inset-0 !size-full !translate-none !rounded-xl !border-0 !bg-transparent ${connecting ? "" : "!pointer-events-none"}`}
          />
          <span className="pointer-events-none absolute top-1/2 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-muted-foreground/50" />
        </>
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
