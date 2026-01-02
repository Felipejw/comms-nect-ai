import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquare, Image, Video, FileText } from "lucide-react";
import { ValidationBadge, validateMessageNode } from "./ValidationBadge";

interface MessageNodeData {
  label?: string;
  content?: string;
  messageType?: "text" | "image" | "video" | "document";
  mediaUrl?: string;
  caption?: string;
  [key: string]: unknown;
}

function MessageNode({ data, selected }: NodeProps) {
  const nodeData = data as MessageNodeData;
  const validationError = validateMessageNode(nodeData);
  
  const getIcon = () => {
    switch (nodeData.messageType) {
      case "image":
        return <Image className="w-4 h-4 text-success-foreground" />;
      case "video":
        return <Video className="w-4 h-4 text-success-foreground" />;
      case "document":
        return <FileText className="w-4 h-4 text-success-foreground" />;
      default:
        return <MessageSquare className="w-4 h-4 text-success-foreground" />;
    }
  };

  const getDescription = () => {
    if (nodeData.messageType === "image") return nodeData.mediaUrl ? "Imagem" : "Adicionar imagem";
    if (nodeData.messageType === "video") return nodeData.mediaUrl ? "Vídeo" : "Adicionar vídeo";
    if (nodeData.messageType === "document") return nodeData.mediaUrl ? "Documento" : "Adicionar documento";
    return nodeData.content || "Clique para editar";
  };
  
  return (
    <div
      className={`relative px-4 py-3 rounded-xl border-2 bg-card shadow-lg min-w-[180px] transition-all ${
        selected ? "border-success ring-2 ring-success/20" : "border-border"
      }`}
    >
      {validationError && <ValidationBadge message={validationError} />}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-success !border-2 !border-background"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-success">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{nodeData.label || "Mensagem"}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {getDescription()}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-success !border-2 !border-background"
      />
    </div>
  );
}

export default memo(MessageNode);
