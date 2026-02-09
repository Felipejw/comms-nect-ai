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

    console.log(`[download-whatsapp-media] Processing media: messageId=${payload.messageId}, type=${payload.mediaType}`);

    const { messageId, mediaType, fileName, base64Data, mimetype, sessionName, instanceName } = payload;

    if (!messageId) {
      return new Response(
        JSON.stringify({ success: false, error: 'messageId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let mediaBuffer: Uint8Array | null = null;
    let contentType = mimetype || 'application/octet-stream';

    // If base64 data is provided directly, decode it
    if (base64Data) {
      console.log(`[download-whatsapp-media] Processing base64 data, length: ${base64Data.length}`);

      // Handle data URI format
      let rawBase64 = base64Data;
      const dataUriMatch = base64Data.match(/^data:([\w\/\-\+\.]+(?:;\s*[\w\-]+=[\w\-]+)*);base64,(.+)$/);
      if (dataUriMatch) {
        contentType = dataUriMatch[1].split(';')[0].trim();
        rawBase64 = dataUriMatch[2];
      }

      try {
        mediaBuffer = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
        console.log(`[download-whatsapp-media] Decoded base64: ${mediaBuffer.length} bytes`);
      } catch (decodeError) {
        console.error('[download-whatsapp-media] Error decoding base64:', decodeError);
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid base64 data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Try to download from Baileys server
      const { data: settings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'baileys_server_url')
        .single();

      const { data: apiKeySettings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'baileys_api_key')
        .single();

      const baileysUrl = settings?.value;
      const baileysApiKey = apiKeySettings?.value;

      if (!baileysUrl) {
        return new Response(
          JSON.stringify({ success: false, error: 'No base64 data provided and Baileys server not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sessName = sessionName || instanceName || 'default';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (baileysApiKey) {
        headers['X-API-Key'] = baileysApiKey;
      }

      console.log(`[download-whatsapp-media] Downloading from Baileys: ${baileysUrl}/sessions/${sessName}/messages/${messageId}/media`);

      const mediaResponse = await fetch(
        `${baileysUrl}/sessions/${sessName}/messages/${messageId}/media`,
        { method: 'GET', headers }
      );

      if (!mediaResponse.ok) {
        const errorText = await mediaResponse.text().catch(() => '');
        console.error(`[download-whatsapp-media] Baileys download failed: ${mediaResponse.status} - ${errorText.substring(0, 200)}`);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to download media from Baileys: ${mediaResponse.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if response is JSON (base64) or binary
      const responseContentType = mediaResponse.headers.get('content-type') || '';

      if (responseContentType.includes('application/json')) {
        const jsonResponse = await mediaResponse.json();
        if (jsonResponse.base64) {
          mediaBuffer = Uint8Array.from(atob(jsonResponse.base64), (c) => c.charCodeAt(0));
          contentType = jsonResponse.mimetype || contentType;
        } else {
          return new Response(
            JSON.stringify({ success: false, error: 'No media data in Baileys response' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        const arrayBuffer = await mediaResponse.arrayBuffer();
        mediaBuffer = new Uint8Array(arrayBuffer);
        contentType = responseContentType || contentType;
      }
    }

    if (!mediaBuffer || mediaBuffer.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No media data to process' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };

    const baseContentType = contentType.split(';')[0].trim();
    const ext = extMap[baseContentType] || fileName?.split('.').pop() || mediaType || 'bin';
    const sessFolder = sessionName || instanceName || 'downloads';
    const storagePath = `${sessFolder}/${messageId}.${ext}`;

    console.log(`[download-whatsapp-media] Uploading to storage: ${storagePath} (${mediaBuffer.length} bytes, ${baseContentType})`);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(storagePath, mediaBuffer, {
        contentType: baseContentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[download-whatsapp-media] Upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;
    console.log(`[download-whatsapp-media] ✅ Media stored successfully: ${publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        path: storagePath,
        contentType: baseContentType,
        size: mediaBuffer.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
if (import.meta.main) Deno.serve(handler);
