import { useState, useCallback } from "react";
import { FlowSidebar } from "@/components/chatbot/FlowSidebar";
import { FlowCanvas } from "@/components/chatbot/FlowCanvas";
import { NodeConfigPanel } from "@/components/chatbot/NodeConfigPanel";
import type { Node } from "@xyflow/react";

export default function Chatbot() {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeUpdateFn, setNodeUpdateFn] = useState<
    ((nodeId: string, data: Record<string, unknown>) => void) | null
  >(null);

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      if (nodeUpdateFn) {
        nodeUpdateFn(nodeId, data);
      }
    },
    [nodeUpdateFn]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      <FlowSidebar
        selectedFlowId={selectedFlowId}
        onSelectFlow={(id) => {
          setSelectedFlowId(id);
          setSelectedNode(null);
        }}
      />
      <FlowCanvas flowId={selectedFlowId} onNodeSelect={handleNodeSelect} />
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onUpdate={handleNodeUpdate}
        />
      )}
    </div>
  );
}
