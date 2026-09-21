"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nodeTypes } from "@/components/editor/nodes";
import { RemovableEdge } from "@/components/editor/edges/removable-edge";
import { NodePanel } from "@/components/editor/node-panel";
import { NODE_META, TOOLBAR_NODE_TYPES } from "@/components/editor/node-meta";
import { createClient } from "@/lib/supabase/client";
import { saveFlow as saveFlowToSupabase } from "@/lib/supabase/queries";
import { NodeType, QuizEdge, QuizNode, QuizNodeData } from "@/lib/types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const edgeTypes = { removable: RemovableEdge };

function defaultDataFor(type: NodeType): QuizNodeData {
  switch (type) {
    case "start":
      return { kind: "start" };
    case "message":
      return { kind: "message", title: "הודעה חדשה", text: "", buttonLabel: "המשך", autoAdvance: false, autoAdvanceSeconds: 3, nextNodeId: null };
    case "question":
      return {
        kind: "question",
        title: "שאלה חדשה",
        answerType: "single_choice",
        required: true,
        allowOther: false,
        combineAnswers: false,
        options: [
          { id: uid("opt"), label: "אפשרות 1", value: "opt_1", score: 0, nextNodeId: null },
          { id: uid("opt"), label: "אפשרות 2", value: "opt_2", score: 0, nextNodeId: null },
        ],
        nextNodeId: null,
      };
    case "name":
      return { kind: "name", title: "איך קוראים לך?", placeholder: "השם שלך", required: true, nextNodeId: null };
    case "lead_details":
      return {
        kind: "lead_details",
        showName: true,
        showPhone: true,
        showEmail: true,
        requirePhoneIL: true,
        showConsent: true,
        consentText: "אני מאשר/ת קבלת מידע ופנייה בנוגע לבקשתי.",
        nextNodeId: null,
      };
    case "condition":
      return { kind: "condition", rules: [], elseNodeId: null };
    case "ab_test":
      return { kind: "ab_test", splitPercent: 50 };
    case "score":
      return { kind: "score", hotThreshold: 26, warmThreshold: 16, nextNodeId: null };
    case "action":
      return { kind: "action", actionKind: "webhook", nextNodeId: null };
    case "end":
      return { kind: "end", title: "תודה רבה!", text: "קיבלנו את הפרטים שלך.", ctaLabel: "", ctaUrl: "" };
  }
}

function toFlowNodes(nodes: QuizNode[], connectedIds: Set<string>): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, _connected: connectedIds.has(n.id) },
    deletable: n.type !== "start",
  }));
}

function toFlowEdges(edges: QuizEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    type: "removable",
    style: { stroke: "var(--color-primary)", strokeWidth: 1.75 },
  }));
}

function computeConnected(nodes: QuizNode[], edges: QuizEdge[]): Set<string> {
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const start = nodes.find((n) => n.type === "start");
  if (start) connected.add(start.id);
  return connected;
}

interface HistoryEntry {
  nodes: QuizNode[];
  edges: QuizEdge[];
}

function FlowEditorInner({
  quizId,
  initialNodes,
  initialEdges,
  onSavedIndicator,
}: {
  quizId: string;
  initialNodes: QuizNode[];
  initialEdges: QuizEdge[];
  onSavedIndicator: (label: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const connectedIds = useMemo(() => computeConnected(initialNodes, initialEdges), [initialNodes, initialEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialNodes, connectedIds));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialEdges));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const skipHistory = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const domainNodesRef = useRef<QuizNode[]>(initialNodes);
  const domainEdgesRef = useRef<QuizEdge[]>(initialEdges);

  const toDomain = useCallback((flowNodes: Node[], flowEdges: Edge[]): { nodes: QuizNode[]; edges: QuizEdge[] } => {
    const domainNodes: QuizNode[] = flowNodes.map((n) => {
      const { _connected, ...rest } = n.data as QuizNodeData & { _connected?: boolean };
      void _connected;
      return { id: n.id, type: n.type as NodeType, position: n.position, data: rest as QuizNodeData };
    });
    const domainEdges: QuizEdge[] = flowEdges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
    }));
    return { nodes: domainNodes, edges: domainEdges };
  }, []);

  const scheduleSave = useCallback(
    (flowNodes: Node[], flowEdges: Edge[]) => {
      const { nodes: dn, edges: de } = toDomain(flowNodes, flowEdges);
      domainNodesRef.current = dn;
      domainEdgesRef.current = de;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveFlowToSupabase(supabase, quizId, dn, de);
        onSavedIndicator("נשמר לפני רגע");
      }, 500);
    },
    [quizId, supabase, toDomain, onSavedIndicator]
  );

  const pushHistory = useCallback(() => {
    if (skipHistory.current) return;
    undoStack.current.push({ nodes: domainNodesRef.current, edges: domainEdgesRef.current });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const refreshConnected = useCallback((flowNodes: Node[], flowEdges: Edge[]) => {
    const { nodes: dn, edges: de } = toDomain(flowNodes, flowEdges);
    const connected = computeConnected(dn, de);
    return flowNodes.map((n) => ({ ...n, data: { ...n.data, _connected: connected.has(n.id) } }));
  }, [toDomain]);

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      setEdges((eds) => {
        const filtered = connection.sourceHandle
          ? eds.filter((e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle))
          : eds.filter((e) => !(e.source === connection.source && !e.sourceHandle));
        const next = addEdge(
          { ...connection, type: "removable", style: { stroke: "var(--color-primary)", strokeWidth: 1.75 } },
          filtered
        );
        setNodes((nds) => refreshConnected(nds, next));
        scheduleSave(nodes, next);
        return next;
      });
    },
    [nodes, pushHistory, refreshConnected, scheduleSave, setEdges, setNodes]
  );

  const handleNodesChange = useCallback<typeof onNodesChange>(
    (changes) => {
      onNodesChange(changes);
      const hasRemove = changes.some((c) => c.type === "remove");
      const hasPositionEnd = changes.some((c) => c.type === "position" && c.dragging === false);
      if (hasRemove || hasPositionEnd) {
        setTimeout(() => {
          setNodes((nds) => {
            scheduleSave(nds, edges);
            return nds;
          });
        }, 0);
      }
    },
    [edges, onNodesChange, scheduleSave, setNodes]
  );

  const handleEdgesChange = useCallback<typeof onEdgesChange>(
    (changes) => {
      onEdgesChange(changes);
      const hasRemove = changes.some((c) => c.type === "remove");
      if (hasRemove) {
        setTimeout(() => {
          setEdges((eds) => {
            setNodes((nds) => refreshConnected(nds, eds));
            scheduleSave(nodes, eds);
            return eds;
          });
        }, 0);
      }
    },
    [nodes, onEdgesChange, refreshConnected, scheduleSave, setEdges, setNodes]
  );

  const addNode = useCallback(
    (type: NodeType) => {
      pushHistory();
      const rightmost = nodes.reduce<{ x: number; y: number } | null>(
        (max, n) => (!max || n.position.x > max.x ? n.position : max),
        null
      );
      const position = rightmost
        ? { x: rightmost.x + 320, y: rightmost.y }
        : screenToFlowPosition({ x: window.innerWidth / 2 - 100, y: 160 });
      const newNode: Node = {
        id: uid(type),
        type,
        position,
        data: { ...defaultDataFor(type), _connected: false },
      };
      setNodes((nds) => {
        const next = [...nds, newNode];
        scheduleSave(next, edges);
        return next;
      });
    },
    [edges, nodes, pushHistory, screenToFlowPosition, scheduleSave, setNodes]
  );

  const selectedNode = useMemo(() => {
    const flowNode = nodes.find((n) => n.id === selectedNodeId);
    if (!flowNode) return null;
    const { _connected, ...rest } = flowNode.data as QuizNodeData & { _connected?: boolean };
    void _connected;
    return { id: flowNode.id, type: flowNode.type as NodeType, position: flowNode.position, data: rest as QuizNodeData };
  }, [nodes, selectedNodeId]);

  function updateSelectedNodeData(data: QuizNodeData) {
    if (!selectedNodeId) return;
    setNodes((nds) => {
      const next = nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...data, _connected: (n.data as { _connected?: boolean })._connected } } : n));
      scheduleSave(next, edges);
      return next;
    });
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    pushHistory();
    setNodes((nds) => {
      const next = nds.filter((n) => n.id !== selectedNodeId);
      setEdges((eds) => {
        const nextEdges = eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);
        scheduleSave(next, nextEdges);
        return nextEdges;
      });
      return next;
    });
    setSelectedNodeId(null);
  }

  function duplicateSelectedNode() {
    if (!selectedNode) return;
    pushHistory();
    const newNode: Node = {
      id: uid(selectedNode.type),
      type: selectedNode.type,
      position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      data: { ...selectedNode.data, _connected: false },
    };
    setNodes((nds) => {
      const next = [...nds, newNode];
      scheduleSave(next, edges);
      return next;
    });
  }

  function undo() {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push({ nodes: domainNodesRef.current, edges: domainEdgesRef.current });
    skipHistory.current = true;
    const connected = computeConnected(entry.nodes, entry.edges);
    setNodes(toFlowNodes(entry.nodes, connected));
    setEdges(toFlowEdges(entry.edges));
    scheduleSave(toFlowNodes(entry.nodes, connected), toFlowEdges(entry.edges));
    skipHistory.current = false;
  }

  function redo() {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push({ nodes: domainNodesRef.current, edges: domainEdgesRef.current });
    skipHistory.current = true;
    const connected = computeConnected(entry.nodes, entry.edges);
    setNodes(toFlowNodes(entry.nodes, connected));
    setEdges(toFlowEdges(entry.edges));
    scheduleSave(toFlowNodes(entry.nodes, connected), toFlowEdges(entry.edges));
    skipHistory.current = false;
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full">
      <div className="relative flex-1 min-w-0">
        <div className="absolute top-3 inset-x-0 z-10 flex justify-center px-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card/95 backdrop-blur px-2 py-1.5 shadow-sm max-w-full overflow-x-auto">
            {TOOLBAR_NODE_TYPES.map((type) => {
              const meta = NODE_META[type];
              const Icon = meta.icon;
              return (
                <Button key={type} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => addNode(type)}>
                  <Icon className="size-3.5" />
                  {meta.label}
                </Button>
              );
            })}
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="ghost" size="icon" className="size-8" onClick={undo} title="בטל">
              <Undo2 className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={redo} title="בצע שוב">
              <Redo2 className="size-3.5" />
            </Button>
          </div>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={() => fitView({ padding: 0.3 })}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            className="!bg-card !border !border-border rounded-lg overflow-hidden"
          />
        </ReactFlow>
      </div>
      {selectedNode && (
        <NodePanel
          node={selectedNode}
          onChange={updateSelectedNodeData}
          onDelete={deleteSelectedNode}
          onDuplicate={duplicateSelectedNode}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

export function FlowEditor(props: {
  quizId: string;
  initialNodes: QuizNode[];
  initialEdges: QuizEdge[];
  onSavedIndicator: (label: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
