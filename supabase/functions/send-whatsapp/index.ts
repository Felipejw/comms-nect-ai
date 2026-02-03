import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WAHA API configuration
const WAHA_API_URL = Deno.env.get("WAHA_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") || Deno.env.get("EVOLUTION_API_KEY");
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
  engine?: string; // "waha" | "baileys"
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
  supabaseAdmin: any
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

  // Format phone number
  let formattedNumber = phoneToSend.replace(/\D/g, "");
  if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
    formattedNumber = "55" + formattedNumber;
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

async function sendViaWAHA(
  connection: Connection,
  phoneToSend: string,
  content: string,
  messageType: string,
  mediaUrl: string | undefined,
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any
): Promise<{ success: boolean; messageId?: string; error?: string; needsReconnection?: boolean }> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  const sessionData = connection.session_data;
  const sessionName = sessionData?.sessionName || sessionData?.instanceName || connection.name.toLowerCase().replace(/\s+/g, "_");

  console.log(`[WAHA] Using session: ${sessionName}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  // Verify connection status
  try {
    const statusCheck = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}`, {
      headers,
    });
    const statusResult = await statusCheck.json();
    console.log(`[WAHA] Session ${sessionName} status:`, JSON.stringify(statusResult));
    
    if (statusResult.status !== "WORKING") {
      await supabaseAdmin
        .from("connections")
        .update({ status: "disconnected" })
        .eq("id", connection.id);
      
      return {
        success: false, 
        error: "WhatsApp desconectado. Por favor, reconecte na página de Conexões.",
        needsReconnection: true 
      };
    }
  } catch (statusError) {
    console.error("[WAHA] Error checking connection status:", statusError);
  }

  // Format the number for WAHA - uses @c.us format
  let formattedNumber = phoneToSend.replace(/\D/g, "");
  
  // Add country code if needed
  if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
    formattedNumber = "55" + formattedNumber;
  }
  
  // WAHA uses chatId format with @c.us
  const chatId = `${formattedNumber}@c.us`;
  
  console.log(`[WAHA] Sending to: ${chatId}`);

  let wahaResponse;

  if (messageType === "text") {
    wahaResponse = await fetch(`${WAHA_API_URL}/api/sendText`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionName,
        chatId,
        text: content,
      }),
    });
  } else if (messageType === "image" && mediaUrl) {
    wahaResponse = await fetch(`${WAHA_API_URL}/api/sendImage`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file: { url: mediaUrl },
        caption: content,
      }),
    });
  } else if (messageType === "document" && mediaUrl) {
    wahaResponse = await fetch(`${WAHA_API_URL}/api/sendFile`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file: { url: mediaUrl },
        filename: content || "document",
      }),
    });
  } else if (messageType === "audio" && mediaUrl) {
    wahaResponse = await fetch(`${WAHA_API_URL}/api/sendVoice`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file: { url: mediaUrl },
      }),
    });
  } else if (messageType === "video" && mediaUrl) {
    wahaResponse = await fetch(`${WAHA_API_URL}/api/sendVideo`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file: { url: mediaUrl },
        caption: content,
      }),
    });
  } else {
    // Default to text
    wahaResponse = await fetch(`${WAHA_API_URL}/api/sendText`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionName,
        chatId,
        text: content,
      }),
    });
  }

  const wahaResult = await wahaResponse.json();
  console.log("[WAHA] Response:", JSON.stringify(wahaResult));

  if (!wahaResponse.ok || wahaResult.error) {
    console.error("[WAHA] Error:", wahaResult);
    return { 
      success: false, 
      error: wahaResult.message || wahaResult.error || "Erro ao enviar mensagem" 
    };
  }

  return { success: true, messageId: wahaResult.id || wahaResult.key?.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client for validating user token
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    // Client for database operations with elevated privileges
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth validation failed:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    const payload: SendMessagePayload = await req.json();
    const { conversationId, content, messageType = "text", mediaUrl } = payload;

    console.log(`Sending WhatsApp message for conversation: ${conversationId}`);

    // Get conversation with contact phone and LID
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select(`
        *,
        contact:contacts (id, name, phone, whatsapp_lid),
        connection:connections (id, type, status, session_data, name, is_default, tenant_id)
      `)
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Conversation not found:", convError);
      return new Response(
        JSON.stringify({ success: false, error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contact = conversation.contact;
    const phone = contact?.phone;
    const whatsappLid = contact?.whatsapp_lid;
    
    console.log(`Contact data: phone="${phone}", whatsapp_lid="${whatsappLid}"`);
    
    // Determine phone to send
    let phoneToSend: string | null = null;
    
    if (phone && phone.length >= 10 && phone.length <= 15) {
      phoneToSend = phone;
      console.log(`Using phone number: ${phoneToSend}`);
    } else if (whatsappLid) {
      console.log(`Contact only has LID: ${whatsappLid}, will try to send directly`);
      phoneToSend = whatsappLid;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Contato sem número de telefone válido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to use the conversation's connection first, then find a default one
    let connection: Connection | null = conversation.connection;
    
    if (!connection || connection.status !== "connected") {
      // Find any available connected connection (prefer Meta API, then WPPConnect)
      const { data: connections } = await supabaseAdmin
        .from("connections")
        .select("id, type, status, session_data, name, is_default, tenant_id")
        .in("type", ["whatsapp", "meta_api"])
        .eq("status", "connected")
        .order("is_default", { ascending: false });

      if (connections && connections.length > 0) {
        // Prefer Meta API connections
        connection = connections.find(c => c.type === "meta_api") || connections[0];
      }
    }

    if (!connection) {
      console.error("No connected WhatsApp instance found");
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma conexão WhatsApp disponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Using connection: ${connection.name} (type: ${connection.type})`);

    // Send message based on connection type and engine
    let result: { success: boolean; messageId?: string; error?: string; needsReconnection?: boolean };

    if (connection.type === "meta_api") {
      result = await sendViaMetaAPI(connection, phoneToSend!, content, messageType, mediaUrl);
    } else if (connection.session_data?.engine === "baileys") {
      result = await sendViaBaileys(connection, phoneToSend!, content, messageType, mediaUrl, supabaseAdmin);
    } else {
      result = await sendViaWAHA(connection, phoneToSend!, content, messageType, mediaUrl, supabaseAdmin);
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error,
          needsReconnection: result.needsReconnection,
          connectionId: connection.id 
        }),
        { status: result.needsReconnection ? 503 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save message to database
    const { error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content,
        message_type: messageType,
        media_url: mediaUrl,
        sender_id: user.id,
        sender_type: "agent",
        is_read: true,
      });

    if (msgError) {
      console.error("Error saving message:", msgError);
    }

    // Update conversation
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        status: conversation.status === "new" ? "in_progress" : conversation.status,
        connection_id: connection.id,
      })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.messageId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
