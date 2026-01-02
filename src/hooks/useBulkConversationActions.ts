import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function useBulkDeleteConversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (conversationIds: string[]) => {
      // Delete messages first
      for (const id of conversationIds) {
        const { error: messagesError } = await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", id);
        
        if (messagesError) throw messagesError;
      }
      
      // Delete conversation tags
      for (const id of conversationIds) {
        const { error: tagsError } = await supabase
          .from("conversation_tags")
          .delete()
          .eq("conversation_id", id);
        
        if (tagsError) throw tagsError;
      }
      
      // Delete conversations
      const { error } = await supabase
        .from("conversations")
        .delete()
        .in("id", conversationIds);
      
      if (error) throw error;
      
      return conversationIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Conversas excluídas",
        description: `${count} conversa(s) excluída(s) com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error deleting conversations:", error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir as conversas",
        variant: "destructive",
      });
    },
  });
}

export function useBulkUpdateConversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      ids, 
      updates 
    }: { 
      ids: string[]; 
      updates: { 
        status?: "new" | "in_progress" | "resolved" | "archived";
        assigned_to?: string | null;
        queue_id?: string | null;
        is_bot_active?: boolean;
      } 
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update(updates)
        .in("id", ids);
      
      if (error) throw error;
      
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Conversas atualizadas",
        description: `${count} conversa(s) atualizada(s) com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error updating conversations:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar as conversas",
        variant: "destructive",
      });
    },
  });
}

export function useBulkAddTagsToConversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ conversationIds, tagIds }: { conversationIds: string[]; tagIds: string[] }) => {
      let added = 0;
      for (const conversationId of conversationIds) {
        for (const tagId of tagIds) {
          // Check if already exists to avoid duplicates
          const { data: existing } = await supabase
            .from("conversation_tags")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("tag_id", tagId)
            .single();
          
          if (!existing) {
            const { error } = await supabase
              .from("conversation_tags")
              .insert({ conversation_id: conversationId, tag_id: tagId });
            if (!error) added++;
          }
        }
      }
      return added;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-tags"] });
      toast({
        title: "Tags adicionadas",
        description: `${count} tag(s) adicionada(s) com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error adding tags:", error);
      toast({
        title: "Erro ao adicionar tags",
        description: "Não foi possível adicionar as tags",
        variant: "destructive",
      });
    },
  });
}

export function useBulkRemoveTagsFromConversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ conversationIds, tagIds }: { conversationIds: string[]; tagIds: string[] }) => {
      let removed = 0;
      for (const conversationId of conversationIds) {
        for (const tagId of tagIds) {
          const { error } = await supabase
            .from("conversation_tags")
            .delete()
            .eq("conversation_id", conversationId)
            .eq("tag_id", tagId);
          if (!error) removed++;
        }
      }
      return removed;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-tags"] });
      toast({
        title: "Tags removidas",
        description: `${count} tag(s) removida(s) com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error removing tags:", error);
      toast({
        title: "Erro ao remover tags",
        description: "Não foi possível remover as tags",
        variant: "destructive",
      });
    },
  });
}

interface ConversationExportData {
  id: string;
  status: string;
  channel: string | null;
  created_at: string;
  last_message_at: string | null;
  contact: { name: string | null; phone: string | null; email: string | null; company: string | null } | null;
  assigned: { name: string } | null;
  messages: { content: string; sender_type: string | null; created_at: string; message_type: string }[];
}

function generateCSV(conversations: ConversationExportData[]): Blob {
  const headers = [
    'Contato', 'Telefone', 'Email', 'Empresa', 'Status', 
    'Canal', 'Atribuído a', 'Criado em', 'Última mensagem', 
    'Total de mensagens', 'Histórico'
  ];
  
  const rows = conversations.map(conv => [
    conv.contact?.name || '',
    conv.contact?.phone || '',
    conv.contact?.email || '',
    conv.contact?.company || '',
    conv.status,
    conv.channel || '',
    conv.assigned?.name || 'Não atribuído',
    format(new Date(conv.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    conv.last_message_at ? format(new Date(conv.last_message_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
    conv.messages.length,
    conv.messages.map(m => 
      `[${format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}] ${m.sender_type}: ${m.content}`
    ).join(' | ')
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  return new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
}

function generatePDF(conversations: ConversationExportData[]): Blob {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .info { color: #666; margin-bottom: 30px; }
          .conversation { margin-bottom: 40px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
          .header { background: #f5f5f5; padding: 15px; border-bottom: 1px solid #ddd; }
          .header h3 { margin: 0 0 10px 0; color: #333; }
          .header p { margin: 5px 0; color: #666; font-size: 14px; }
          .messages { padding: 15px; }
          .message { margin: 8px 0; padding: 10px 15px; border-radius: 8px; font-size: 14px; }
          .message.contact { background: #e3f2fd; margin-right: 20%; }
          .message.agent, .message.system { background: #e8f5e9; margin-left: 20%; }
          .message.bot { background: #fff3e0; margin-left: 20%; }
          .message-meta { font-size: 11px; color: #999; margin-bottom: 5px; }
          .message-content { color: #333; }
          .no-messages { color: #999; font-style: italic; padding: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Exportação de Conversas</h1>
        <p class="info">Data: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} | Total: ${conversations.length} conversa(s)</p>
        ${conversations.map(conv => `
          <div class="conversation">
            <div class="header">
              <h3>${conv.contact?.name || 'Sem nome'}</h3>
              <p><strong>Telefone:</strong> ${conv.contact?.phone || '-'}</p>
              <p><strong>Email:</strong> ${conv.contact?.email || '-'}</p>
              <p><strong>Empresa:</strong> ${conv.contact?.company || '-'}</p>
              <p><strong>Status:</strong> ${conv.status} | <strong>Canal:</strong> ${conv.channel || '-'}</p>
              <p><strong>Atribuído a:</strong> ${conv.assigned?.name || 'Não atribuído'}</p>
              <p><strong>Criado em:</strong> ${format(new Date(conv.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
            <div class="messages">
              ${conv.messages.length > 0 ? conv.messages.map(m => `
                <div class="message ${m.sender_type || 'system'}">
                  <div class="message-meta">${format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} - ${m.sender_type || 'sistema'}</div>
                  <div class="message-content">${m.content}</div>
                </div>
              `).join('') : '<p class="no-messages">Nenhuma mensagem</p>'}
            </div>
          </div>
        `).join('')}
      </body>
    </html>
  `;
  
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export function useExportConversations() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      conversationIds, 
      format: exportFormat 
    }: { 
      conversationIds: string[]; 
      format: 'csv' | 'pdf' 
    }) => {
      // Fetch conversations with contacts
      const { data: conversations, error } = await supabase
        .from("conversations")
        .select(`
          id,
          status,
          channel,
          created_at,
          last_message_at,
          assigned_to,
          contact:contacts(name, phone, email, company)
        `)
        .in("id", conversationIds);

      if (error) throw error;

      // Fetch messages and assigned agent for each conversation
      const conversationsWithMessages: ConversationExportData[] = await Promise.all(
        (conversations || []).map(async (conv) => {
          const { data: messages } = await supabase
            .from("messages")
            .select("content, sender_type, created_at, message_type")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });
          
          // Fetch assigned agent name if exists
          let assignedAgent: { name: string } | null = null;
          if (conv.assigned_to) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("name")
              .eq("user_id", conv.assigned_to)
              .single();
            assignedAgent = profile;
          }
          
          return { 
            ...conv, 
            contact: conv.contact as ConversationExportData['contact'],
            assigned: assignedAgent,
            messages: (messages || []).map(m => ({
              content: m.content,
              sender_type: m.sender_type,
              created_at: m.created_at,
              message_type: m.message_type
            }))
          };
        })
      );

      if (exportFormat === 'csv') {
        return { blob: generateCSV(conversationsWithMessages), format: exportFormat };
      } else {
        return { blob: generatePDF(conversationsWithMessages), format: exportFormat };
      }
    },
    onSuccess: ({ blob, format: exportFormat }) => {
      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const extension = exportFormat === 'csv' ? 'csv' : 'html';
      a.download = `conversas_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Exportação concluída",
        description: `Arquivo ${exportFormat.toUpperCase()} gerado com sucesso`,
      });
    },
    onError: (error) => {
      console.error("Error exporting conversations:", error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar as conversas",
        variant: "destructive",
      });
    },
  });
}
