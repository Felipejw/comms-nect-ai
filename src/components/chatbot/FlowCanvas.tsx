import { useCallback, useRef, useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Connection,
  Node,
  Edge,
  NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { NodePaletteTopBar, NodePaletteSidebar } from "./NodePalette";
import TriggerNode from "./nodes/TriggerNode";
import MessageNode from "./nodes/MessageNode";
import ConditionNode from "./nodes/ConditionNode";
import DelayNode from "./nodes/DelayNode";
import MenuNode from "./nodes/MenuNode";
import TransferNode from "./nodes/TransferNode";
import EndNode from "./nodes/EndNode";
import AINode from "./nodes/AINode";
import CRMNode from "./nodes/CRMNode";
import { useFlow, useSaveFlowData } from "@/hooks/useFlows";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  menu: MenuNode,
  transfer: TransferNode,
  end: EndNode,
  ai: AINode,
  crm: CRMNode,
};

interface FlowCanvasProps {
  flowId: string | null;
  onNodeSelect: (node: Node | null) => void;
  onDeleteNode?: (nodeId: string) => void;
  onRegisterDeleteFn?: (fn: (nodeId: string) => void) => void;
}

function FlowCanvasInner({ flowId, onNodeSelect, onRegisterDeleteFn }: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: flowData, isLoading } = useFlow(flowId);
  const saveFlowData = useSaveFlowData();

  // Load flow data
  useEffect(() => {
    if (flowData) {
      const loadedNodes: Node[] = flowData.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: { x: node.position_x || 0, y: node.position_y || 0 },
        data: (node.data as Record<string, unknown>) || {},
      }));

      const loadedEdges: Edge[] = flowData.edges.map((edge) => ({
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        label: edge.label || undefined,
      }));

      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setHasChanges(false);
    } else if (!flowId) {
      setNodes([]);
      setEdges([]);
    }
  }, [flowData, flowId, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      setHasChanges(true);
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");

      if (!type || !reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: crypto.randomUUID(),
        type,
        position,
        data: { label: getDefaultLabel(type) },
      };

      setNodes((nds) => nds.concat(newNode));
      setHasChanges(true);
    },
    [reactFlowInstance, setNodes]
  );

  const getDefaultLabel = (type: string): string => {
    const labels: Record<string, string> = {
      trigger: "Gatilho",
      message: "Mensagem",
      condition: "Condição",
      delay: "Aguardar",
      menu: "Menu",
      transfer: "Transferir",
      end: "Encerrar",
      ai: "IA",
      crm: "CRM",
    };
    return labels[type] || "Bloco";
  };

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      if (changes.some((c: any) => c.type === "position" || c.type === "remove")) {
        setHasChanges(true);
      }
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      if (changes.some((c: any) => c.type === "remove")) {
        setHasChanges(true);
      }
    },
    [onEdgesChange]
  );

  const handleSave = async () => {
    if (!flowId) return;

    setIsSaving(true);
    try {
      await saveFlowData.mutateAsync({
        flowId,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type || "message",
          position: node.position,
          data: node.data as Record<string, unknown>,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label as string | undefined,
        })),
      });
      setHasChanges(false);
      toast.success("Fluxo salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar fluxo");
    } finally {
      setIsSaving(false);
    }
  };

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
        )
      );
      setHasChanges(true);
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setHasChanges(true);
    },
    [setNodes, setEdges]
  );

  // Register delete function with parent
  useEffect(() => {
    if (onRegisterDeleteFn) {
      onRegisterDeleteFn(deleteNode);
    }
  }, [onRegisterDeleteFn, deleteNode]);

  if (!flowId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">Selecione um fluxo</p>
          <p className="text-sm">ou crie um novo para começar</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" ref={reactFlowWrapper}>
      <div className="p-3 border-b border-border flex items-center justify-between bg-background">
        <NodePaletteTopBar disabled={!flowId} />
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="gap-2"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {hasChanges ? "Salvar alterações" : "Salvo"}
        </Button>
      </div>
      <div className="flex-1 flex">
        <NodePaletteSidebar disabled={!flowId} />
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-muted/20"
          >
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  trigger: "hsl(var(--primary))",
                  message: "hsl(var(--success))",
                  condition: "hsl(var(--warning))",
                  delay: "hsl(var(--info))",
                  menu: "#f97316",
                  transfer: "hsl(var(--destructive))",
                  end: "#ec4899",
                  ai: "#8b5cf6",
                  crm: "#0ea5e9",
                };
                return colors[node.type || ""] || "#6b7280";
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export { FlowCanvasInner };
