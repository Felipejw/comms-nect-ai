import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DownloadMediaPayload {
  instanceName: string;
  messageKey: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  mediaType: 'audio' | 'image' | 'video' | 'document';
  fileName?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('Missing Evolution API configuration');
      throw new Error('Evolution API not configured');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      throw new Error('Supabase not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: DownloadMediaPayload = await req.json();

    console.log('Downloading media:', {
      instanceName: payload.instanceName,
      messageId: payload.messageKey.id,
      mediaType: payload.mediaType
    });

    // Call Evolution API to get base64 media
    const evolutionUrl = `${evolutionApiUrl}/chat/getBase64FromMediaMessage/${payload.instanceName}`;
    
    console.log('Calling Evolution API:', evolutionUrl);

    const evolutionResponse = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        message: {
          key: payload.messageKey
        },
        convertToMp4: payload.mediaType === 'audio' || payload.mediaType === 'video'
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('Evolution API error:', evolutionResponse.status, errorText);
      throw new Error(`Evolution API error: ${evolutionResponse.status}`);
    }

    const mediaData = await evolutionResponse.json();
    console.log('Evolution API response received, base64 length:', mediaData.base64?.length || 0);

    if (!mediaData.base64) {
      console.error('No base64 data in response:', mediaData);
      throw new Error('No media data received from Evolution API');
    }

    // Determine file extension and mime type
    let extension = 'bin';
    let mimeType = 'application/octet-stream';

    if (payload.mediaType === 'audio') {
      extension = 'ogg';
      mimeType = 'audio/ogg';
      // Check if it was converted to mp4
      if (mediaData.mimetype?.includes('mp4') || mediaData.mimetype?.includes('mpeg')) {
        extension = 'mp3';
        mimeType = 'audio/mpeg';
      }
    } else if (payload.mediaType === 'image') {
      extension = 'jpg';
      mimeType = 'image/jpeg';
      if (mediaData.mimetype?.includes('png')) {
        extension = 'png';
        mimeType = 'image/png';
      } else if (mediaData.mimetype?.includes('webp')) {
        extension = 'webp';
        mimeType = 'image/webp';
      }
    } else if (payload.mediaType === 'video') {
      extension = 'mp4';
      mimeType = 'video/mp4';
    } else if (payload.mediaType === 'document') {
      // Try to extract from filename or mimetype
      if (payload.fileName) {
        const parts = payload.fileName.split('.');
        if (parts.length > 1) {
          extension = parts[parts.length - 1];
        }
      }
      if (mediaData.mimetype) {
        mimeType = mediaData.mimetype;
      }
    }

    // Override with actual mimetype if provided
    if (mediaData.mimetype) {
      mimeType = mediaData.mimetype;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = payload.fileName 
      ? `${timestamp}-${randomSuffix}-${payload.fileName}`
      : `${timestamp}-${randomSuffix}.${extension}`;
    
    const filePath = `${payload.mediaType}/${fileName}`;

    console.log('Uploading to storage:', { filePath, mimeType });

    // Convert base64 to Uint8Array
    const binaryString = atob(mediaData.base64);
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
      console.error('Storage upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    console.log('Media uploaded successfully:', publicUrlData.publicUrl);

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
    console.error('Error in download-whatsapp-media:', error);
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
