import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
  // For direct base64 upload (from webhook)
  base64Data?: string;
  mimetype?: string;
}

serve(async (req) => {
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

    console.log('[download-whatsapp-media] Request:', {
      sessionName: payload.sessionName || payload.instanceName,
      messageId: payload.messageId,
      mediaType: payload.mediaType,
      hasBase64: !!payload.base64Data,
    });

    let base64Data = payload.base64Data;
    let mimetype = payload.mimetype;

    // If no base64 data provided, try to fetch from Baileys
    if (!base64Data) {
      // Get Baileys server URL from settings
      const { data: baileysUrlSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "baileys_server_url")
        .single();

      const { data: baileysApiKeySetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "baileys_api_key")
        .single();

      const baileysUrl = baileysUrlSetting?.value || Deno.env.get("BAILEYS_API_URL") || "http://baileys:3000";
      const baileysApiKey = baileysApiKeySetting?.value || Deno.env.get("BAILEYS_API_KEY");
      const sessionName = payload.sessionName || payload.instanceName;
      
      if (sessionName && baileysUrl) {
        try {
          console.log('[download-whatsapp-media] Fetching media from Baileys API...');
          
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (baileysApiKey) {
            headers['X-API-Key'] = baileysApiKey;
          }
          
          const baileysResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/download-media`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              messageId: payload.messageId,
            }),
          });

          if (baileysResponse.ok) {
            const mediaData = await baileysResponse.json();
            base64Data = mediaData.data?.base64 || mediaData.base64 || mediaData.data;
            mimetype = mediaData.data?.mimetype || mediaData.mimetype || mediaData.mimeType;
            console.log('[download-whatsapp-media] Media fetched from Baileys');
          } else {
            console.log('[download-whatsapp-media] Baileys response not ok:', baileysResponse.status);
          }
        } catch (e) {
          console.error('[download-whatsapp-media] Error fetching from Baileys:', e);
        }
      }
    }

    if (!base64Data) {
      console.error('[download-whatsapp-media] No media data available');
      throw new Error('No media data received');
    }

    // Determine file extension and mime type
    let extension = 'bin';
    let mimeType = mimetype || 'application/octet-stream';

    if (payload.mediaType === 'audio') {
      extension = 'ogg';
      mimeType = 'audio/ogg';
      
      if (mimetype) {
        if (mimetype.includes('mp4') || mimetype.includes('m4a')) {
          extension = 'm4a';
          mimeType = 'audio/mp4';
        } else if (mimetype.includes('mpeg') || mimetype.includes('mp3')) {
          extension = 'mp3';
          mimeType = 'audio/mpeg';
        } else if (mimetype.includes('webm')) {
          extension = 'webm';
          mimeType = 'audio/webm';
        }
      }
      
      console.log('[download-whatsapp-media] Audio format:', { extension, mimeType });
    } else if (payload.mediaType === 'image') {
      extension = 'jpg';
      mimeType = 'image/jpeg';
      if (mimetype?.includes('png')) {
        extension = 'png';
        mimeType = 'image/png';
      } else if (mimetype?.includes('webp')) {
        extension = 'webp';
        mimeType = 'image/webp';
      }
    } else if (payload.mediaType === 'video') {
      extension = 'mp4';
      mimeType = 'video/mp4';
    } else if (payload.mediaType === 'document') {
      if (payload.fileName) {
        const parts = payload.fileName.split('.');
        if (parts.length > 1) {
          extension = parts[parts.length - 1];
        }
      }
      if (mimetype) {
        mimeType = mimetype;
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = payload.fileName 
      ? `${timestamp}-${randomSuffix}-${payload.fileName}`
      : `${timestamp}-${randomSuffix}.${extension}`;
    
    const filePath = `${payload.mediaType}/${fileName}`;

    console.log('[download-whatsapp-media] Uploading to storage:', { filePath, mimeType });

    // Clean base64 data
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

    // Convert base64 to Uint8Array
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('[download-whatsapp-media] Storage upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    console.log('[download-whatsapp-media] Media uploaded successfully:', { 
      url: publicUrlData.publicUrl, 
      mimeType, 
      path: filePath 
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrlData.publicUrl,
        path: filePath,
        mimeType
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error('[download-whatsapp-media] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to download media';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
