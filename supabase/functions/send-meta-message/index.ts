import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_URL = "https://graph.facebook.com/v18.0";

interface SendMessageRequest {
  connectionId: string;
  to: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  filename?: string;
  template?: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: string;
      parameters: Array<{ type: string; text?: string; image?: { link: string } }>;
    }>;
  };
  buttons?: Array<{ type: string; reply: { id: string; title: string } }>;
}

interface MetaMessagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: string;
  text?: { body: string; preview_url?: boolean };
  image?: { link: string; caption?: string };
  audio?: { link: string };
  video?: { link: string; caption?: string };
  document?: { link: string; filename?: string; caption?: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<unknown>;
  };
  interactive?: {
    type: string;
    body?: { text: string };
    action?: { buttons?: Array<{ type: string; reply: { id: string; title: string } }> };
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body: SendMessageRequest = await req.json();
    const { connectionId, to, message, mediaUrl, mediaType, filename, template, buttons } = body;

    // ... keep existing code (message sending logic via Meta API)
  } catch (error) {
    console.error("[Send Meta Message] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
