import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PRIMARY_BUCKET = 'whatsapp-media';
const FALLBACK_BUCKET = 'chat-attachments';

async function tryUpload(bucket: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const path = `attachments/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
}

export function useFileUpload() {
  return useMutation({
    mutationFn: async (file: File) => {
      // Try primary bucket (whatsapp-media - guaranteed on VPS)
      try {
        return await tryUpload(PRIMARY_BUCKET, file);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (!msg.includes('bucket') && !msg.includes('not found')) {
          throw err; // Not a bucket issue
        }
        console.warn('[useFileUpload] Primary bucket failed, trying fallback:', msg);
      }

      // Fallback to chat-attachments
      return await tryUpload(FALLBACK_BUCKET, file);
    },
    onError: (error: Error) => {
      toast.error('Erro ao enviar arquivo: ' + error.message);
    },
  });
}
