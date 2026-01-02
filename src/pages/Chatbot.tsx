import { useState, useCallback, useEffect } from "react";
import { FlowSidebar } from "@/components/chatbot/FlowSidebar";
import { FlowCanvas } from "@/components/chatbot/FlowCanvas";
import { NodeConfigPanel } from "@/components/chatbot/NodeConfigPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Node } from "@xyflow/react";

export default function Chatbot() {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nodeUpdateFn, setNodeUpdateFn] = useState<
    ((nodeId: string, data: Record<string, unknown>) => void) | null
  >(null);
  const [nodeDeleteFn, setNodeDeleteFn] = useState<
    ((nodeId: string) => void) | null
  >(null);
  const [saveFn, setSaveFn] = useState<(() => Promise<void>) | null>(null);

  // Auto-collapse sidebar when a flow is selected
  useEffect(() => {
    if (selectedFlowId) {
      setSidebarCollapsed(true);
    }
  }, [selectedFlowId]);

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

  const handleRegisterSaveFn = useCallback((fn: () => Promise<void>) => {
    setSaveFn(() => fn);
  }, []);

  const handleSaveFlow = useCallback(async () => {
    if (saveFn) {
      await saveFn();
    }
  }, [saveFn]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-4rem)] -m-6">
        <FlowSidebar
          selectedFlowId={selectedFlowId}
          onSelectFlow={(id) => {
            setSelectedFlowId(id);
            setSelectedNode(null);
            setConfigPanelOpen(false);
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />
        <FlowCanvas
          flowId={selectedFlowId}
          onNodeSelect={handleNodeSelect}
          onRegisterDeleteFn={handleRegisterDeleteFn}
          onRegisterSaveFn={handleRegisterSaveFn}
          onSavingChange={setIsSaving}
        />
        <NodeConfigPanel
          node={selectedNode}
          open={configPanelOpen}
          onClose={handleCloseConfig}
          onUpdate={handleNodeUpdate}
          onDelete={handleNodeDelete}
          onSaveFlow={handleSaveFlow}
          isSaving={isSaving}
        />
      </div>
    </TooltipProvider>
  );
}
