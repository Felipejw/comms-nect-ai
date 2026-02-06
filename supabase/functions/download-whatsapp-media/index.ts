import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DownloadMediaPayload {
  sessionName?: string;
  instanceName?: string;
  messageId: string;
  mediaType: 'audio' | 'image' | 'video' | 'document';
  fileName?: string;
  base64Data?: string;
  mimetype?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      throw new Error('Supabase not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: DownloadMediaPayload = await req.json();

    // ... keep existing code (media download, storage upload logic)
  } catch (error: unknown) {
    console.error('[download-whatsapp-media] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to download media';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
};

export default handler;
Deno.serve(handler);
