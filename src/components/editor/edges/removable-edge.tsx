import { EdgeLabelRenderer, BaseEdge, EdgeProps, Position, getSmoothStepPath, useReactFlow, Node } from "reactflow";
import { X } from "lucide-react";

// Ignores exactly where a connection was dragged from/to and anchors it to
// the node's own left/right-center instead, so every edge into or out of a
// block lands on the same fixed point no matter where inside it you drag.
function nodeAnchor(node: Node | undefined, position: Position, fallback: { x: number; y: number }) {
  if (!node || node.width == null || node.height == null) return fallback;
  const { x, y } = node.positionAbsolute ?? node.position;
  switch (position) {
    case Position.Left:
      return { x, y: y + node.height / 2 };
    case Position.Right:
      return { x: x + node.width, y: y + node.height / 2 };
    case Position.Top:
      return { x: x + node.width / 2, y };
    case Position.Bottom:
      return { x: x + node.width / 2, y: y + node.height };
    default:
      return fallback;
  }
}

export function RemovableEdge({
  id,
  source,
  target,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { deleteElements, getNode } = useReactFlow();
  // A node with a single generic handle (no id) gets centered on the
  // node's own edge for a consistent anchor. A node with several distinct
  // handles — e.g. one per answer option — must keep each edge's real,
  // per-handle position instead, or every option's line would collapse
  // onto the same point.
  const sourceAnchor = sourceHandleId
    ? { x: sourceX, y: sourceY }
    : nodeAnchor(getNode(source), sourcePosition, { x: sourceX, y: sourceY });
  const targetAnchor = nodeAnchor(getNode(target), targetPosition, { x: targetX, y: targetY });
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sourceAnchor.x,
    sourceY: sourceAnchor.y,
    sourcePosition,
    targetX: targetAnchor.x,
    targetY: targetAnchor.y,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, strokeWidth: selected ? 2.5 : 1.75 }}
      />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan absolute flex size-4 items-center justify-center rounded-full border bg-card text-muted-foreground/60 shadow-sm hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          onClick={(e) => {
            e.stopPropagation();
            deleteElements({ edges: [{ id }] });
          }}
          title="הסר חיבור"
        >
          <X className="size-2.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
