import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// whatsapp-media is more reliably available on VPS (created by webhook/init.sql)
const PRIMARY_BUCKET = 'chat-attachments';
const FALLBACK_BUCKET = 'whatsapp-media';

async function ensureBucketViaAdmin(bucketId: string): Promise<boolean> {
  try {
    console.log(`[useFileUpload] Attempting to create bucket '${bucketId}' via admin-write...`);
    const { data, error } = await supabase.functions.invoke('admin-write', {
      body: {
        operation: 'ensure-bucket',
        data: { id: bucketId, name: bucketId, public: true },
      },
    });
    if (error || data?.error) {
      console.warn('[useFileUpload] admin-write ensure-bucket failed:', data?.error || error?.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[useFileUpload] admin-write call failed:', e);
    return false;
  }
}

function getMediaSubfolder(file: File): string {
  const mime = file.type || '';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

async function tryUpload(bucket: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const subfolder = getMediaSubfolder(file);
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const path = `${subfolder}/${fileName}`;

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
      // Try primary bucket (whatsapp-media) first
      try {
        return await tryUpload(PRIMARY_BUCKET, file);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (!msg.includes('bucket') && !msg.includes('not found') && !msg.includes('security') && !msg.includes('policy')) {
          throw err;
        }
        console.warn('[useFileUpload] Primary bucket failed, trying fallback...');
      }

      // Try fallback bucket
      try {
        return await tryUpload(FALLBACK_BUCKET, file);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (!msg.includes('bucket') && !msg.includes('not found') && !msg.includes('security') && !msg.includes('policy')) {
          throw err;
        }
      }

      // Both missing — try to create primary via admin
      const created = await ensureBucketViaAdmin(PRIMARY_BUCKET);
      if (created) {
        return await tryUpload(PRIMARY_BUCKET, file);
      }

      throw new Error('Nenhum bucket de armazenamento disponível. Verifique a configuração do servidor.');
    },
    onError: (error: Error) => {
      toast.error('Erro ao enviar arquivo: ' + error.message);
    },
  });
}
