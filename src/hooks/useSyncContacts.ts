import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MergeResult {
  total: number;
  merged: number;
  updated: number;
  failed: number;
  details: string[];
}

export function useSyncContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ success: boolean; result?: MergeResult; error?: string }>('merge-duplicate-contacts', {
        method: 'POST',
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha na sincronização');
      
      return data.result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      
      if (result) {
        const message = `Sincronização concluída: ${result.merged} mesclados, ${result.updated} atualizados`;
        toast.success(message);
        
        if (result.failed > 0) {
          toast.warning(`${result.failed} contatos falharam durante a sincronização`);
        }
      }
    },
    onError: (error: Error) => {
      toast.error('Erro na sincronização: ' + error.message);
    },
  });
}

// Helper to check if a contact has LID issues
export function hasLidIssue(contact: { phone?: string | null; whatsapp_lid?: string | null }): boolean {
  if (!contact.phone) return false;
  
  const cleanPhone = contact.phone.replace(/\D/g, '');
  
  // Phone is too long (likely a LID)
  if (cleanPhone.length > 15) return true;
  
  // Phone equals whatsapp_lid
  if (contact.whatsapp_lid && contact.phone === contact.whatsapp_lid) return true;
  
  return false;
}

// Helper to check if a contact has a placeholder name
export function hasPlaceholderName(contact: { name?: string; phone?: string | null; whatsapp_lid?: string | null }): boolean {
  if (!contact.name) return true;
  
  const badNames = ['Chatbot Whats', 'Contato Desconhecido'];
  if (badNames.includes(contact.name)) return true;
  
  // Name is just a phone number or LID
  if (contact.name === contact.phone) return true;
  if (contact.name === contact.whatsapp_lid) return true;
  if (/^\d{14,}$/.test(contact.name)) return true;
  
  return false;
}
