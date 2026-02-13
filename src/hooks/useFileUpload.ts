import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const BUCKET_NAME = 'chat-attachments';

async function ensureBucketExists(): Promise<void> {
  console.log('[useFileUpload] Bucket not found, creating via admin-write...');
  const { data, error } = await supabase.functions.invoke('admin-write', {
    body: {
      operation: 'ensure-bucket',
      data: {
        id: BUCKET_NAME,
        name: BUCKET_NAME,
        public: true,
      },
    },
  });

  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Unknown error';
    console.error('[useFileUpload] Failed to create bucket:', msg);
    throw new Error(`Falha ao criar bucket: ${msg}`);
  }
  console.log('[useFileUpload] Bucket created successfully');
}

async function uploadFile(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const path = `attachments/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  return publicUrl;
}

export function useFileUpload() {
  return useMutation({
    mutationFn: async (file: File) => {
      try {
        return await uploadFile(file);
      } catch (err: any) {
        // If bucket doesn't exist, create it and retry once
        const msg = err?.message || '';
        if (msg.includes('Bucket not found') || msg.includes('bucket') || msg.includes('not found')) {
          await ensureBucketExists();
          return await uploadFile(file);
        }
        throw err;
      }
    },
    onError: (error: Error) => {
      toast.error('Erro ao enviar arquivo: ' + error.message);
    },
  });
}
