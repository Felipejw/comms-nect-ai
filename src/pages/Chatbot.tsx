import { useState, useCallback } from "react";
import { FlowSidebar } from "@/components/chatbot/FlowSidebar";
import { FlowCanvas } from "@/components/chatbot/FlowCanvas";
import { NodeConfigPanel } from "@/components/chatbot/NodeConfigPanel";
import type { Node } from "@xyflow/react";

export default function Chatbot() {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [nodeUpdateFn, setNodeUpdateFn] = useState<
    ((nodeId: string, data: Record<string, unknown>) => void) | null
  >(null);
  const [nodeDeleteFn, setNodeDeleteFn] = useState<
    ((nodeId: string) => void) | null
  >(null);

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
    setConfigPanelOpen(!!node);
  }, []);

  const handleCloseConfig = useCallback(() => {
    setConfigPanelOpen(false);
    setSelectedNode(null);
  }, []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      if (nodeUpdateFn) {
        nodeUpdateFn(nodeId, data);
      }
    },
    [nodeUpdateFn]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      if (nodeDeleteFn) {
        nodeDeleteFn(nodeId);
      }
    },
    [nodeDeleteFn]
  );

  const handleRegisterDeleteFn = useCallback((fn: (nodeId: string) => void) => {
    setNodeDeleteFn(() => fn);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      <FlowSidebar
        selectedFlowId={selectedFlowId}
        onSelectFlow={(id) => {
          setSelectedFlowId(id);
          setSelectedNode(null);
          setConfigPanelOpen(false);
        }}
      />
      <FlowCanvas
        flowId={selectedFlowId}
        onNodeSelect={handleNodeSelect}
        onRegisterDeleteFn={handleRegisterDeleteFn}
      />
      <NodeConfigPanel
        node={selectedNode}
        open={configPanelOpen}
        onClose={handleCloseConfig}
        onUpdate={handleNodeUpdate}
        onDelete={handleNodeDelete}
      />
    </div>
  );
}
