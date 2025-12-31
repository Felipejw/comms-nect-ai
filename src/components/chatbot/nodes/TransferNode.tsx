import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { UserPlus, Users, Phone } from "lucide-react";

interface TransferNodeData {
  label?: string;
  transferType?: "queue" | "agent" | "whatsapp";
  queueId?: string;
  queueName?: string;
  agentId?: string;
  agentName?: string;
  connectionId?: string;
  connectionName?: string;
  message?: string;
  [key: string]: unknown;
}

function TransferNode({ data, selected }: NodeProps) {
  const nodeData = data as TransferNodeData;
  
  const getTransferInfo = () => {
    switch (nodeData.transferType) {
      case "agent":
        return nodeData.agentName || "Selecione o atendente";
      case "whatsapp":
        return nodeData.connectionName || "Selecione o número";
      case "queue":
      default:
        return nodeData.queueName || "Selecione o setor";
    }
  };

  const getIcon = () => {
    switch (nodeData.transferType) {
      case "agent":
        return <Users className="w-4 h-4 text-destructive-foreground" />;
      case "whatsapp":
        return <Phone className="w-4 h-4 text-destructive-foreground" />;
      default:
        return <UserPlus className="w-4 h-4 text-destructive-foreground" />;
    }
  };
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-destructive ring-2 ring-destructive/20" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-destructive !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive">
          {getIcon()}
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{nodeData.label || "Transferir"}</p>
          <p className="text-xs text-muted-foreground">
            {getTransferInfo()}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-destructive !border-2 !border-background"
      />
    </div>
  );
}

export default memo(TransferNode);
