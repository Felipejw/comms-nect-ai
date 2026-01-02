import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageCircle } from "lucide-react";

interface WhatsAppNodeData {
  label?: string;
  connectionId?: string;
  connectionName?: string;
  phoneNumber?: string;
  [key: string]: unknown;
}

function WhatsAppNode({ data, selected }: NodeProps) {
  const nodeData = data as WhatsAppNodeData;
  
  const getConnectionInfo = () => {
    if (nodeData.connectionName) {
      return nodeData.phoneNumber 
        ? `${nodeData.connectionName} (${nodeData.phoneNumber})` 
        : nodeData.connectionName;
    }
    return "Selecione o número";
  };
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-green-500 ring-2 ring-green-500/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "WhatsApp"}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[120px]">
            {getConnectionInfo()}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-background"
      />
    </div>
  );
}

export default memo(WhatsAppNode);
