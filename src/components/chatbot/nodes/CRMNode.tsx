import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { LayoutList } from "lucide-react";
import { ValidationBadge, validateCRMNode } from "./ValidationBadge";

interface CRMNodeData {
  label?: string;
  kanbanColumnId?: string;
  kanbanColumnName?: string;
  [key: string]: unknown;
}

function CRMNode({ data, selected }: NodeProps) {
  const nodeData = data as CRMNodeData;
  const validationError = validateCRMNode(nodeData);
  
  return (
    <div
      className={`relative px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-sky-500 ring-2 ring-sky-500/20" : "border-border"
      }`}
    >
      {validationError && <ValidationBadge message={validationError} />}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-sky-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-sky-500">
          <LayoutList className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "CRM"}</p>
          <p className="text-xs text-muted-foreground">
            {nodeData.kanbanColumnName || "Clique para configurar"}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-sky-500 !border-2 !border-background"
      />
    </div>
  );
}

export default memo(CRMNode);
