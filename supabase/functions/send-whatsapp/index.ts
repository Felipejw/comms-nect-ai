import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_URL = "https://graph.facebook.com/v18.0";

interface SendMessagePayload {
  conversationId: string;
  content: string;
  messageType?: "text" | "image" | "audio" | "document" | "video";
  mediaUrl?: string;
}

interface SessionData {
  sessionName?: string;
  token?: string;
  instanceName?: string;
  engine?: string;
  // Meta API fields
  access_token?: string;
  phone_number_id?: string;
}

interface Connection {
  id: string;
  type: string;
  status: string;
  session_data: SessionData | null;
  name: string;
  is_default: boolean;
  tenant_id: string;
}

async function sendViaBaileys(
  connection: Connection,
  phoneToSend: string,
  content: string,
  messageType: string,
  mediaUrl: string | undefined,
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  isLidSend: boolean = false
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Get Baileys server URL from settings
  const { data: settings } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "baileys_server_url")
    .single();

  const { data: apiKeySettings } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "baileys_api_key")
    .single();

  const baileysUrl = settings?.value;
  const baileysApiKey = apiKeySettings?.value;

  if (!baileysUrl) {
    return { success: false, error: "Baileys server URL not configured" };
  }

  const sessionData = connection.session_data;
  const sessionName = sessionData?.sessionName || connection.name.toLowerCase().replace(/\s+/g, "_");

  console.log(`[Baileys] Using session: ${sessionName}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (baileysApiKey) {
    headers["X-API-Key"] = baileysApiKey;
  }

  // Format the destination - LID uses @lid suffix, phone uses @s.whatsapp.net
  let formattedNumber: string;
  if (isLidSend) {
    // For LID contacts, send with @lid suffix so Baileys uses the LID protocol
    formattedNumber = `${phoneToSend.replace(/\D/g, "")}@lid`;
    console.log(`[Baileys] Sending to LID: ${formattedNumber}`);
  } else {
    formattedNumber = phoneToSend.replace(/\D/g, "");
    if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
      formattedNumber = "55" + formattedNumber;
    }
    console.log(`[Baileys] Sending to phone: ${formattedNumber}`);
  }

  let response;

  if (mediaUrl && messageType !== "text") {
    response = await fetch(`${baileysUrl}/sessions/${sessionName}/send/media`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: formattedNumber,
        mediaUrl,
        caption: content,
        mediaType: messageType,
      }),
    });
  } else {
    response = await fetch(`${baileysUrl}/sessions/${sessionName}/send/text`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: formattedNumber,
        text: content,
      }),
    });
  }

  const result = await response.json();
  console.log("[Baileys] Response:", JSON.stringify(result));

  if (!result.success) {
    return { success: false, error: result.error || "Failed to send message" };
  }

  return { success: true, messageId: result.data?.messageId };
}

async function sendViaMetaAPI(
  connection: Connection,
  phoneToSend: string,
  content: string,
  messageType: string,
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const sessionData = connection.session_data;
  
  if (!sessionData?.access_token || !sessionData?.phone_number_id) {
    return { success: false, error: "Meta API credentials not configured" };
  }

  const formattedTo = phoneToSend.replace(/[^\d]/g, "");

  let payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedTo,
    type: "text",
  };

  if (messageType === "image" && mediaUrl) {
    payload.type = "image";
    payload.image = { link: mediaUrl, caption: content };
  } else if (messageType === "video" && mediaUrl) {
    payload.type = "video";
    payload.video = { link: mediaUrl, caption: content };
  } else if (messageType === "audio" && mediaUrl) {
    payload.type = "audio";
    payload.audio = { link: mediaUrl };
  } else if (messageType === "document" && mediaUrl) {
    payload.type = "document";
    payload.document = { link: mediaUrl, caption: content };
  } else {
    payload.type = "text";
    payload.text = { body: content, preview_url: true };
  }

  console.log("[Meta API] Sending message:", JSON.stringify(payload));

  const response = await fetch(
    `${META_API_URL}/${sessionData.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sessionData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("[Meta API] Error:", result);
    return { success: false, error: result.error?.message || "Failed to send message" };
  }

  console.log("[Meta API] Success:", result);
  return { success: true, messageId: result.messages?.[0]?.id };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ... keep existing code (auth validation, message routing to Baileys or Meta API)
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
