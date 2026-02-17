import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
      // Try primary bucket first
      try {
        return await tryUpload(PRIMARY_BUCKET, file);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (!msg.includes('bucket') && !msg.includes('not found')) {
          throw err; // Not a bucket issue
        }
      }

      // Primary bucket missing — try to create it
      const created = await ensureBucketViaAdmin(PRIMARY_BUCKET);
      if (created) {
        try {
          return await tryUpload(PRIMARY_BUCKET, file);
        } catch {
          // fall through to fallback
        }
      }

      // Use fallback bucket (whatsapp-media) which exists on VPS
      console.log('[useFileUpload] Using fallback bucket:', FALLBACK_BUCKET);
      return await tryUpload(FALLBACK_BUCKET, file);
    },
    onError: (error: Error) => {
      toast.error('Erro ao enviar arquivo: ' + error.message);
    },
  });
}
